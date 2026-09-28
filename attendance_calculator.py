import json
import datetime
import math
import sys

def get_classes_count(days_list, start_date, end_date):
    """Calculates how many times a subject occurs between two dates."""
    # Map day strings to datetime.weekday() ints (Monday is 0, Sunday is 6)
    days_map = {"Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3, "Friday": 4, "Saturday": 5, "Sunday": 6}
    count = 0
    curr = start_date
    while curr <= end_date:
        # Add the number of times this weekday appears in the subject's days_list
        count += sum(1 for d in days_list if days_map[d] == curr.weekday())
        curr += datetime.timedelta(days=1)
    return count

def main():
    print("=" * 60)
    print("         VIBE - SMART ATTENDANCE DASHBOARD (PYTHON)")
    print("=" * 60)

    # 1. Load timetables
    try:
        with open('srm_timetables.json', 'r') as f:
            timetables = json.load(f)
    except FileNotFoundError:
        print("Error: 'srm_timetables.json' not found. Please ensure it's in the same folder.")
        sys.exit(1)

    # 2. Select Section
    sections = list(timetables.keys())
    print("\nAvailable Sections:")
    for i, sec in enumerate(sections, 1):
        print(f"[{i}] {sec}")
    
    sec_idx = -1
    while sec_idx < 0 or sec_idx >= len(sections):
        try:
            sec_idx = int(input("\nSelect your section number: ")) - 1
        except ValueError:
            pass

    section_name = sections[sec_idx]
    subjects = timetables[section_name]

    # 3. Enter Current Attendance
    print(f"\n--- Entering Attendance for {section_name} ---")
    current_attendance = {}
    for subj in subjects:
        while True:
            try:
                val = float(input(f"Current attendance % for {subj}: "))
                if 0 <= val <= 100:
                    current_attendance[subj] = val
                    break
                else:
                    print("Please enter a value between 0 and 100.")
            except ValueError:
                print("Invalid input. Please enter a number.")

    # 4. Planning Date
    print("\n--- Planning Phase ---")
    plan_date_str = input("Enter a future date to plan a trip/skip (YYYY-MM-DD) or press Enter to skip: ").strip()
    plan_date = None
    if plan_date_str:
        try:
            plan_date = datetime.datetime.strptime(plan_date_str, "%Y-%m-%d").date()
        except ValueError:
            print("Invalid date format. Skipping planning phase.")

    # Constants & Dates
    start_date = datetime.date(2026, 8, 29)
    end_date = datetime.date(2026, 11, 29)
    # Locked to the current date of the scenario
    today = datetime.date(2026, 9, 28)

    print("\n" + "=" * 60)
    print("                       YOUR PLAN")
    print("=" * 60)

    # 5. Calculations
    for subj, days_list in subjects.items():
        curr_pct = current_attendance[subj]
        
        past_classes = get_classes_count(days_list, start_date, today)
        attended = round((curr_pct / 100.0) * past_classes)
        
        future_start = today + datetime.timedelta(days=1)
        future_to_end = get_classes_count(days_list, future_start, end_date)
        
        total_overall = past_classes + future_to_end
        
        req_75 = math.ceil(0.75 * total_overall)
        needed_75 = max(0, req_75 - attended)
        
        req_90 = math.ceil(0.90 * total_overall)
        needed_90 = max(0, req_90 - attended)
        
        impossible = needed_75 > future_to_end
        
        print(f"\nSubject: {subj.upper()}")
        print(f"  Classes Held So Far: {past_classes}")
        print(f"  Classes Attended:    {attended}")
        print(f"  Remaining Classes:   {future_to_end}")
        
        if impossible:
            print(f"  Needed for 75%:      ⚠️ IRREVERSIBLE DETENTION! ⚠️")
        else:
            print(f"  Needed for 75%:      {needed_75}")
            
        if needed_90 > future_to_end:
            print(f"  Needed for 90%:      Impossible")
        else:
            print(f"  Needed for 90%:      {needed_90}")
            
        if plan_date and plan_date > today:
            future_to_plan = get_classes_count(days_list, future_start, plan_date)
            if impossible:
                print("  Plan Alert:          No planning will save you now.")
            else:
                classes_left_after = future_to_end - future_to_plan
                if classes_left_after >= needed_75:
                    print(f"  Plan Alert:          ✅ You can safely skip ALL {future_to_plan} classes until {plan_date} and still hit 75%.")
                else:
                    must_attend = needed_75 - classes_left_after
                    print(f"  Plan Alert:          ⚠️ You MUST attend {must_attend} classes before {plan_date}.")

    print("\n" + "=" * 60)

if __name__ == '__main__':
    main()
