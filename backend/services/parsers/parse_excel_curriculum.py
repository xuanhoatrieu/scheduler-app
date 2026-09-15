#!/usr/bin/env python3
import sys
import json
import openpyxl

def parse_curriculum_excel(file_path):
    wb = openpyxl.load_workbook(file_path, data_only=True)
    ws = wb.active

    courses = []
    current_major_code = 'I'
    current_major_name = 'I. Khối kiến thức giáo dục đại cương'
    current_sub_code = 'I.1'
    current_sub_name = 'I.1. Các học phần bắt buộc'
    current_branch_name = '' # Cơ sở ngành, Chuyên ngành...

    # Part 1: Cấu trúc theo Khối kiến thức (Dòng 7 đến 95)
    for r in range(7, 95):
        row = [ws.cell(row=r, column=c).value for c in range(1, 9)]
        stt, ky, ma, ten, ten_en, tc, lt, th = [str(x).strip() if x is not None else '' for x in row]

        # Nhận diện dòng tiêu đề khối lớn / khối con
        if ma in ['I', 'II'] or ma.startswith('I.') or ma.startswith('II.') or 'Khối' in ten or 'Khóa luận' in ten or 'học phần' in ten.lower() or 'cơ sở ngành' in ten.lower() or 'chuyên ngành' in ten.lower():
            if ma == 'I' or 'đại cương' in ten.lower():
                current_major_code = 'I'
                current_major_name = 'I. Khối kiến thức giáo dục đại cương'
                current_sub_code = 'I.1'
                current_sub_name = 'I.1. Các học phần bắt buộc'
                current_branch_name = ''
            elif ma == 'II' or 'chuyên nghiệp' in ten.lower():
                current_major_code = 'II'
                current_major_name = 'II. Khối kiến thức giáo dục chuyên nghiệp'
                current_branch_name = ''
            elif ma == 'I.1' or (current_major_code == 'I' and 'bắt buộc' in ten.lower()):
                current_sub_code = 'I.1'
                current_sub_name = 'I.1. Các học phần bắt buộc'
            elif ma == 'I.2' or (current_major_code == 'I' and 'tự chọn' in ten.lower()):
                current_sub_code = 'I.2'
                current_sub_name = 'I.2. Các học phần tự chọn (Chọn 8 TC)'
            elif ma == 'II.1' or 'cơ sở ngành' in ten.lower():
                current_branch_name = 'Kiến thức cơ sở ngành'
                current_sub_code = 'II.1'
                current_sub_name = 'II.1. Kiến thức cơ sở ngành'
            elif ma == 'II.1.1' or ('cơ sở' in current_branch_name.lower() and 'bắt buộc' in ten.lower()):
                current_sub_code = 'II.1.1'
                current_sub_name = 'II.1.1. Kiến thức cơ sở ngành — Bắt buộc'
            elif ma == 'II.1.2' or ('cơ sở' in current_branch_name.lower() and 'tự chọn' in ten.lower()):
                current_sub_code = 'II.1.2'
                current_sub_name = 'II.1.2. Kiến thức cơ sở ngành — Tự chọn (Chọn 12 TC)'
            elif ma == 'II.2' or ('chuyên ngành' in ten.lower() and 'cơ sở' not in ten.lower()):
                current_branch_name = 'Kiến thức chuyên ngành'
                current_sub_code = 'II.2'
                current_sub_name = 'II.2. Kiến thức chuyên ngành'
            elif ma == 'II.2.1' or ('chuyên ngành' in current_branch_name.lower() and 'bắt buộc' in ten.lower()):
                current_sub_code = 'II.2.1'
                current_sub_name = 'II.2.1. Kiến thức chuyên ngành — Bắt buộc'
            elif ma == 'II.2.2' or ('chuyên ngành' in current_branch_name.lower() and 'tự chọn' in ten.lower()):
                current_sub_code = 'II.2.2'
                current_sub_name = 'II.2.2. Kiến thức chuyên ngành — Tự chọn (Chọn 15 TC)'
            elif ma == 'II.3' or 'khóa luận' in ten.lower() or 'thực tập' in ten.lower() or 'thay thế' in ten.lower():
                current_sub_code = 'II.3'
                current_sub_name = 'II.3. Khóa luận tốt nghiệp hoặc Thực tập tốt nghiệp / Học phần thay thế (10 TC)'
            continue

        if not ma or not ten or ma == 'None' or ten == 'None':
            continue

        # Môn điều kiện (GD thể chất, GD quốc phòng)
        is_condition = ('thể chất' in ten.lower() or 
                        'quốc phòng' in ten.lower() or 
                        'GDQP' in ma or 
                        'CB701' in ma or
                        ten.lower().startswith('giáo dục thể chất') or
                        ten.lower().startswith('giáo dục quốc phòng'))

        is_elective = ('tự chọn' in current_sub_name.lower() or 'tự chọn' in ten.lower())

        try:
            credits_val = int(float(tc)) if tc else 0
        except:
            credits_val = 0

        try:
            theory_val = int(float(lt)) if lt else 0
        except:
            theory_val = 0

        try:
            practice_val = int(float(th)) if th else 0
        except:
            practice_val = 0

        try:
            sem_val = int(float(ky)) if ky else 0
        except:
            sem_val = 0

        # Nhóm tự chọn & định mức tín chỉ
        elective_group = ''
        if is_elective:
            if 'I.2' in current_sub_code:
                elective_group = 'Tự chọn đại cương (Yêu cầu 8 TC)'
            elif 'II.1.2' in current_sub_code:
                elective_group = 'Tự chọn cơ sở ngành (Yêu cầu 12 TC)'
            elif 'II.2.2' in current_sub_code:
                elective_group = 'Tự chọn chuyên ngành (Yêu cầu 15 TC)'

        course_type = 'Điều kiện' if is_condition else ('Tự chọn' if is_elective else 'Bắt buộc')

        courses.append({
            'stt': int(stt) if stt.isdigit() else len(courses) + 1,
            'excelSemester': sem_val if sem_val > 0 else None, # Cột B trong Khung CTĐT của Excel
            'semester': sem_val if sem_val > 0 else None,
            'courseCode': ma,
            'courseName': ten,
            'courseNameEn': ten_en,
            'credits': credits_val,
            'theoryHours': theory_val,
            'practiceHours': practice_val,
            'majorBlockCode': current_major_code,
            'majorBlockName': current_major_name,
            'subBlockCode': current_sub_code,
            'subBlockName': current_sub_name,
            'blockCode': current_sub_code,
            'blockName': current_major_name,
            'courseType': course_type,
            'isElective': is_elective,
            'electiveGroup': elective_group,
            'isCondition': is_condition
        })

    # Part 2: Phân kỳ khuyến nghị (Học kỳ 1 đến 8)
    sem_map = {}
    current_ky = 0
    for r in range(97, ws.max_row + 1):
        row = [ws.cell(row=r, column=c).value for c in range(1, 8)]
        stt, ky, ma, ten, ten_en, tc, lt = [str(x).strip() if x is not None else '' for x in row]
        if 'Tổng học kỳ' in ten:
            continue
        if ky.isdigit():
            current_ky = int(ky)
        if ma and ma != 'None' and not ma.startswith('I') and not 'STT' in stt:
            if current_ky > 0:
                sem_map[ma] = current_ky

    # Bổ sung kỳ khuyến nghị từ Part 2 vào recommendedSemester (KHÔNG ghi đè excelSemester ở Cột B)
    for c in courses:
        c['recommendedSemester'] = sem_map.get(c['courseCode'], c['excelSemester'])

    # Tính tổng tín chỉ theo Cột B của Excel:
    # Các môn được đánh số ở Cột B là các môn bình thường SV phải học.
    courses_with_col_b = [c for c in courses if c['excelSemester'] is not None and c['excelSemester'] > 0]
    total_col_b_credits = sum(c['credits'] for c in courses_with_col_b)
    # Trừ 3 TC GDTC (môn điều kiện) nếu có
    gdtc_credits = sum(c['credits'] for c in courses_with_col_b if 'thể chất' in c['courseName'].lower() or 'CB701' in c['courseCode'])
    deduction_credits = gdtc_credits if gdtc_credits > 0 else 3
    calculated_grad_credits = total_col_b_credits - deduction_credits

    result = {
        'totalCourses': len(courses),
        'totalColBCourses': len(courses_with_col_b),
        'totalColBCredits': total_col_b_credits,
        'deductionCredits': deduction_credits,
        'totalGraduationCredits': calculated_grad_credits if calculated_grad_credits > 0 else 153,
        'conditionCredits': sum(c['credits'] for c in courses if c['isCondition']),
        'courses': courses
    }

    return result

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Vui lòng cung cấp đường dẫn file Excel'}))
        sys.exit(1)
    file_path = sys.argv[1]
    try:
        data = parse_curriculum_excel(file_path)
        print(json.dumps(data, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({'error': str(e)}))
        sys.exit(1)
