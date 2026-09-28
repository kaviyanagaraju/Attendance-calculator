const START_DATE = new Date('2026-08-29T00:00:00');
const END_DATE = new Date('2026-11-29T23:59:59');
let TODAY = new Date('2026-09-28T00:00:00');

let timetables = {};
let appliedLeaves = [];
let healthChart = null;

// Event Listeners
document.getElementById('fileInput').addEventListener('change', handleFileUpload);
document.getElementById('sectionSelect').addEventListener('change', handleSectionSelect);
document.getElementById('calculateBtn').addEventListener('click', calculateAttendance);
document.getElementById('addOdBtn').addEventListener('click', handleAddLeave);

// Chatbot UI
document.getElementById('chatToggle').addEventListener('click', toggleChat);
document.getElementById('chatClose').addEventListener('click', toggleChat);
document.getElementById('chatSend').addEventListener('click', handleChatSubmit);
document.getElementById('chatInput').addEventListener('keypress', (e) => { if(e.key === 'Enter') handleChatSubmit(); });

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (file) {
        document.getElementById('fileLabel').textContent = file.name;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                timetables = JSON.parse(e.target.result);
                populateSections();
            } catch (err) {
                alert('Invalid JSON file.');
            }
        };
        reader.readAsText(file);
    }
}

function populateSections() {
    const select = document.getElementById('sectionSelect');
    select.innerHTML = '<option value="" disabled selected>Select your section...</option>';
    for (const section in timetables) {
        const option = document.createElement('option');
        option.value = section;
        option.textContent = section;
        select.appendChild(option);
    }
    document.getElementById('setupSection').classList.remove('hidden');
}

function handleSectionSelect() {
    const section = document.getElementById('sectionSelect').value;
    const subjects = timetables[section];
    const list = document.getElementById('subjectsList');
    list.innerHTML = '';
    
    for (const subject in subjects) {
        const div = document.createElement('div');
        div.className = 'subject-input fade-in';
        div.innerHTML = `
            <label>${subject}</label>
            <div class="input-group">
                <input type="number" id="att_${subject.replace(/\s+/g, '_')}" min="0" max="100" placeholder="e.g. 80">
                <span class="percent">%</span>
            </div>
        `;
        list.appendChild(div);
    }
    document.getElementById('subjectsSection').classList.remove('hidden');
}

// OD Logic
function handleAddLeave() {
    const start = document.getElementById('odStart').value;
    const end = document.getElementById('odEnd').value;
    if(!start || !end) { alert('Please select start and end dates.'); return; }
    
    const startDate = new Date(start);
    startDate.setHours(0,0,0,0);
    const endDate = new Date(end);
    endDate.setHours(23,59,59,999);
    
    if(startDate > endDate) { alert('Start date must be before end date.'); return; }
    
    appliedLeaves.push({ start: startDate, end: endDate, startStr: start, endStr: end });
    renderOdList();
}

function renderOdList() {
    const list = document.getElementById('odList');
    list.innerHTML = '';
    appliedLeaves.forEach((leave, idx) => {
        const tag = document.createElement('div');
        tag.className = 'od-tag';
        tag.innerHTML = `
            <span>OD/ML: ${leave.startStr} to ${leave.endStr}</span>
            <button onclick="removeLeave(${idx})">×</button>
        `;
        list.appendChild(tag);
    });
}

window.removeLeave = function(idx) {
    appliedLeaves.splice(idx, 1);
    renderOdList();
}

function getClassesCount(daysArray, fromDate, toDate) {
    const daysMap = { "Sunday": 0, "Monday": 1, "Tuesday": 2, "Wednesday": 3, "Thursday": 4, "Friday": 5, "Saturday": 6 };
    let count = 0;
    let current = new Date(fromDate);
    current.setHours(0,0,0,0);
    const end = new Date(toDate);
    end.setHours(23,59,59,999);
    
    while (current <= end) {
        const dayInt = current.getDay();
        const occurrencesToday = daysArray.filter(d => daysMap[d] === dayInt).length;
        count += occurrencesToday;
        current.setDate(current.getDate() + 1);
    }
    return count;
}

// Core Math Function (Extracted for Chart and Chatbot)
function runMathCore(section, inputs, overrideLeaves = null) {
    const subjects = timetables[section];
    const leavesToUse = overrideLeaves !== null ? overrideLeaves : appliedLeaves;
    
    let planDateInput = document.getElementById('planDate').value;
    let planDate = planDateInput ? new Date(planDateInput) : null;
    if(planDate) planDate.setHours(23,59,59,999);
    
    const results = [];
    
    for (const subject in subjects) {
        const currentPercent = inputs[subject] || 0;
        const daysArray = subjects[subject];
        
        // Past
        const pastClasses = getClassesCount(daysArray, START_DATE, TODAY);
        const attended = Math.round((currentPercent / 100) * pastClasses);
        
        // Future
        const futureDateStart = new Date(TODAY);
        futureDateStart.setDate(futureDateStart.getDate() + 1);
        const futureClassesToEnd = getClassesCount(daysArray, futureDateStart, END_DATE);
        
        // OD Classes
        let odClasses = 0;
        leavesToUse.forEach(leave => {
            // Only count ODs that happen in the future, as past is already in current %
            if (leave.start > TODAY) {
                const effectiveStart = new Date(Math.max(leave.start, futureDateStart));
                odClasses += getClassesCount(daysArray, effectiveStart, leave.end);
            }
        });
        
        const guaranteedAttended = odClasses;
        const remainingToPhysicallyAttend = futureClassesToEnd - odClasses;
        
        const totalClassesOverall = pastClasses + futureClassesToEnd;
        
        const required75 = Math.ceil(0.75 * totalClassesOverall);
        const needed75 = Math.max(0, required75 - attended - guaranteedAttended);
        
        const required90 = Math.ceil(0.90 * totalClassesOverall);
        const needed90 = Math.max(0, required90 - attended - guaranteedAttended);
        
        const impossible = needed75 > remainingToPhysicallyAttend;
        
        let futureClassesToPlan = 0;
        if (planDate && planDate > TODAY) {
            futureClassesToPlan = getClassesCount(daysArray, futureDateStart, planDate);
            // subtract ODs in this plan period
            leavesToUse.forEach(leave => {
                if (leave.start > TODAY && leave.start <= planDate) {
                    const effEnd = new Date(Math.min(leave.end, planDate));
                    futureClassesToPlan -= getClassesCount(daysArray, leave.start, effEnd);
                }
            });
        }
        
        // Projected % if they attend EVERYTHING remaining
        const maxProjected = ((attended + guaranteedAttended + remainingToPhysicallyAttend) / totalClassesOverall) * 100;
        
        results.push({
            subject, pastClasses, attended, futureClassesToEnd: remainingToPhysicallyAttend,
            guaranteedAttended, needed75, needed90, impossible, planDate, 
            futureClassesToPlan, maxProjected, totalClassesOverall
        });
    }
    return results;
}

function calculateAttendance() {
    const section = document.getElementById('sectionSelect').value;
    const subjects = timetables[section];
    if(!section) return;
    
    // gather inputs
    const inputs = {};
    for (const subject in subjects) {
        const idSafe = subject.replace(/\s+/g, '_');
        const val = document.getElementById(`att_${idSafe}`).value;
        inputs[subject] = parseFloat(val) || 0;
    }
    
    const results = runMathCore(section, inputs);
    
    const resultsList = document.getElementById('resultsList');
    resultsList.innerHTML = '';
    
    let chartLabels = [];
    let chartCurrent = [];
    let chartMax = [];
    
    results.forEach(res => {
        chartLabels.push(res.subject);
        chartCurrent.push(((res.attended / res.pastClasses) * 100) || 0);
        chartMax.push(res.maxProjected);
        
        renderResultCard(resultsList, res);
    });
    
    renderChart(chartLabels, chartCurrent, chartMax);
    
    document.getElementById('resultsSection').classList.remove('hidden');
    setTimeout(() => { document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth' }); }, 100);
}

function renderResultCard(list, res) {
    const card = document.createElement('div');
    card.className = 'result-card fade-in';
    
    let alertHtml = '';
    if (res.impossible) {
        alertHtml = `<div class="danger-alert">⚠️ Irreversible Detention! ⚠️<br>Mathematically impossible to reach 75%.</div>`;
    } else if (res.needed75 === 0) {
        alertHtml = `<div class="safe-alert">🎉 You're safe! 0 classes needed for 75%.</div>`;
    }
    
    let planHtml = '';
    if (res.planDate) {
        if (res.impossible) {
            planHtml = `<div class="plan-notice">No planning will save you now.</div>`;
        } else {
            const classesLeftAfterPlan = res.futureClassesToEnd - res.futureClassesToPlan;
            if (classesLeftAfterPlan >= res.needed75) {
                planHtml = `<div class="plan-notice">✅ You can safely skip all <b>${res.futureClassesToPlan}</b> physical classes until your planned date and still hit 75%.</div>`;
            } else {
                const mustAttendBeforePlan = res.needed75 - classesLeftAfterPlan;
                planHtml = `<div class="plan-notice">⚠️ You cannot skip everything! You MUST attend <b>${mustAttendBeforePlan}</b> classes before your planned date.</div>`;
            }
        }
    }
    
    let odHtml = res.guaranteedAttended > 0 ? 
        `<div class="stat-row" style="color: var(--success)"><span>Free OD Classes:</span><span class="stat-value">${res.guaranteedAttended}</span></div>` : '';

    card.innerHTML = `
        <h3>${res.subject}</h3>
        <div class="stat-row"><span>Classes Held So Far:</span><span class="stat-value">${res.pastClasses}</span></div>
        <div class="stat-row"><span>Classes Attended:</span><span class="stat-value">${res.attended}</span></div>
        ${odHtml}
        <div class="stat-row" style="margin-top: 1rem; border-top: 1px solid var(--glass-border); padding-top: 0.5rem;">
            <span>Physical Remaining Classes:</span><span class="stat-value" style="color: var(--accent);">${res.futureClassesToEnd}</span>
        </div>
        <div class="stat-row">
            <span>Needed for 75% (Danger Zone):</span>
            <span class="stat-value" style="${res.impossible ? 'color: var(--danger);' : ''}">${res.needed75}</span>
        </div>
        ${alertHtml}
        ${planHtml}
    `;
    list.appendChild(card);
}

// Chart.js rendering
function renderChart(labels, currentData, maxData) {
    const ctx = document.getElementById('healthChart').getContext('2d');
    if(healthChart) healthChart.destroy();
    
    healthChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Current %',
                    data: currentData,
                    backgroundColor: 'rgba(59, 130, 246, 0.7)',
                    borderColor: 'rgba(59, 130, 246, 1)',
                    borderWidth: 1
                },
                {
                    label: 'Max Possible %',
                    data: maxData,
                    backgroundColor: 'rgba(16, 185, 129, 0.3)',
                    borderColor: 'rgba(16, 185, 129, 1)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            scales: {
                y: { beginAtZero: true, max: 100, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#94a3b8' } },
                x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
            },
            plugins: {
                legend: { labels: { color: '#f8fafc' } }
            }
        }
    });
}


/* ================= Chatbot Logic ================= */
function toggleChat() {
    const panel = document.getElementById('chatPanel');
    if (panel.classList.contains('hidden')) {
        panel.classList.remove('hidden');
    } else {
        panel.classList.add('hidden');
    }
}

function handleChatSubmit() {
    const inputField = document.getElementById('chatInput');
    const text = inputField.value.trim();
    if(!text) return;
    
    appendMessage(text, 'user');
    inputField.value = '';
    
    // simulate thinking
    setTimeout(() => { processChatBot(text); }, 600);
}

function appendMessage(msg, sender) {
    const box = document.getElementById('chatMessages');
    const div = document.createElement('div');
    div.className = `msg ${sender}`;
    div.textContent = msg;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

function processChatBot(query) {
    const section = document.getElementById('sectionSelect').value;
    if(!section) {
        appendMessage("Please select a section and enter your current attendance in the dashboard first so I have your data!", 'bot');
        return;
    }
    
    const q = query.toLowerCase();
    
    // Match: "take [X] day sick leave"
    const leaveMatch = q.match(/(?:take|have|get).*\s+(\d+)\s*-?day\s+(?:sick|leave|od|medical)/i);
    // Match: "starting tomorrow" or "starting YYYY-MM-DD"
    const dateMatch = q.match(/start(?:ing)?\s+(tomorrow|\d{4}-\d{2}-\d{2})/i);
    
    // Find mentioned subject (if any)
    let targetSubject = null;
    const subjects = timetables[section];
    for(const sub in subjects) {
        if (q.includes(sub.toLowerCase())) { targetSubject = sub; break; }
    }
    
    if (leaveMatch) {
        const days = parseInt(leaveMatch[1]);
        let start = new Date(TODAY);
        start.setDate(start.getDate() + 1); // default tomorrow
        
        if (dateMatch && dateMatch[1] !== 'tomorrow') {
            start = new Date(dateMatch[1]);
        }
        
        let end = new Date(start);
        end.setDate(end.getDate() + (days - 1));
        
        // Gather current inputs
        const inputs = {};
        for (const sub in subjects) {
            const val = document.getElementById(`att_${sub.replace(/\s+/g, '_')}`).value;
            inputs[sub] = parseFloat(val) || 0;
        }
        
        // Run simulated math without modifying UI state
        let tempLeaves = [...appliedLeaves, { start, end }];
        const results = runMathCore(section, inputs, tempLeaves);
        
        if (targetSubject) {
            const res = results.find(r => r.subject === targetSubject);
            if (res.impossible) {
                appendMessage(`If you take that ${days}-day leave, your ${targetSubject} attendance will drop so low that it will be MATHEMATICALLY IMPOSSIBLE to reach 75%. DO NOT TAKE IT.`, 'bot');
            } else if (res.needed75 > 0) {
                appendMessage(`If you take that ${days}-day leave starting ${start.toDateString()}, you can still recover! You will need to attend ${res.needed75} more ${targetSubject} classes to hit 75%.`, 'bot');
            } else {
                appendMessage(`You're totally fine! Even if you take the ${days}-day leave, your ${targetSubject} attendance is strong enough to maintain 75%. Enjoy your rest!`, 'bot');
            }
        } else {
            // User didn't specify a subject, so check ALL subjects
            let doomedSubjects = [];
            let strugglingSubjects = [];
            
            results.forEach(res => {
                if (res.impossible) doomedSubjects.push(res.subject);
                else if (res.needed75 > 0) strugglingSubjects.push(res.subject);
            });
            
            if (doomedSubjects.length > 0) {
                appendMessage(`WARNING! If you take that ${days}-day leave, it will become MATHEMATICALLY IMPOSSIBLE to reach 75% in: ${doomedSubjects.join(', ')}.`, 'bot');
            } else if (strugglingSubjects.length > 0) {
                appendMessage(`You can take the ${days}-day leave, but you will need to catch up! You'll need extra physical classes in: ${strugglingSubjects.join(', ')}.`, 'bot');
            } else {
                appendMessage(`Good news! If you take the ${days}-day leave, ALL your subjects will still be safe above 75%. Enjoy your time off!`, 'bot');
            }
        }
    } else {
        appendMessage("I'm an AI assistant. I can simulate specific scenarios for you! Try asking: 'If I take a 4-day sick leave starting tomorrow, will my Chemistry attendance drop below 75%?'", 'bot');
    }
}
