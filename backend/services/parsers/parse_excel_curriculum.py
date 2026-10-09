#!/usr/bin/env python3
import sys
import json
import openpyxl
import re

def parse_curriculum_excel(file_path):
    wb = openpyxl.load_workbook(file_path, data_only=True)
    ws = wb.active

    courses = []
    current_major_code = 'I'
    current_major_name = 'I. Khối kiến thức giáo dục đại cương'
    current_sub_code = 'I.1'
    current_sub_name = 'I.1. Khối kiến thức đại cương bắt buộc'
    current_is_elective_block = False
    current_is_condition_block = False

    # 1. Part 1: Cấu trúc theo Khối kiến thức (Dòng 7 đến 94)
    for r in range(7, 95):
        row = [ws.cell(row=r, column=c).value for c in range(1, 9)]
        stt, ky, ma, ten, ten_en, tc, lt, th = [str(x).strip() if x is not None else '' for x in row]

        # Nhận diện dòng tiêu đề khối lớn / khối con
        if ma in ['I', 'II', 'I.1', 'I.2', 'I.3', 'I.4', 'II.1', 'II.1.1', 'II.1.2', 'II.2', 'II.2.1', 'II.2.2', 'II.3', 'II.4', 'II.5', 'II.6'] or (not stt and ('Khối' in ten or 'bắt buộc' in ten.lower() or 'tự chọn' in ten.lower())):
            if ma == 'I' or ('đại cương' in ten.lower() and 'chuyên nghiệp' not in ten.lower()):
                current_major_code = 'I'
                current_major_name = 'I. Khối kiến thức giáo dục đại cương'
            elif ma == 'II' or 'chuyên nghiệp' in ten.lower():
                current_major_code = 'II'
                current_major_name = 'II. Khối kiến thức giáo dục chuyên nghiệp'

            if ma in ['I.1', 'I.2', 'I.3', 'I.4', 'II.1.1', 'II.1.2', 'II.2.1', 'II.2.2', 'II.3', 'II.4', 'II.5', 'II.6']:
                current_sub_code = ma
                current_sub_name = f"{ma}. {ten}"
            elif ten:
                current_sub_name = ten

            current_is_elective_block = ma in ['I.2', 'II.1.2', 'II.2.2'] or ('tự chọn' in ten.lower())
            current_is_condition_block = ma in ['I.3', 'I.4'] or ('thể chất' in ten.lower()) or ('quốc phòng' in ten.lower())
            continue

        if not ma or not ten or ma == 'None' or ten == 'None' or ma.startswith('III') or 'tổng số tín chỉ' in ten.lower():
            continue

        # Đánh giá môn điều kiện (GD thể chất, GD quốc phòng)
        is_condition = current_is_condition_block or ('thể chất' in ten.lower() or 
                        'quốc phòng' in ten.lower() or 
                        'GDQP' in ma or 
                        'CB701' in ma or
                        ten.lower().startswith('giáo dục thể chất') or
                        ten.lower().startswith('giáo dục quốc phòng'))

        is_elective = current_is_elective_block or ('tự chọn' in ten.lower())

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
            sem_val = int(float(ky)) if ky and ky != 'None' and ky.isdigit() else None
        except:
            sem_val = None

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
            'excelSemester': sem_val, # Cột B trong Khung CTĐT của Excel (Số kỳ khuyến nghị nếu có)
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
            'isCondition': is_condition,
            'isOrganized': False,
            'semester': sem_val
        })

    # 2. Part 2: Phân kỳ khuyến nghị và Xác định môn được tổ chức giảng dạy (Dòng 96 trở đi)
    part2_sem_map = {}
    current_ky = 0
    for r in range(96, ws.max_row + 1):
        row = [ws.cell(row=r, column=c).value for c in range(1, 9)]
        stt, ky, ma, ten = [str(row[i]).strip() if row[i] is not None else '' for i in range(4)]
        
        # Nhận diện tiêu đề Học kỳ
        if 'Tổng' in ten or 'HỌC KỲ' in stt.upper() or 'HỌC KỲ' in ky.upper() or 'HỌC KỲ' in ma.upper() or 'HỌC KỲ' in ten.upper():
            for val in [stt, ky, ma, ten]:
                if 'HỌC KỲ' in val.upper():
                    m = re.search(r'\d+', val)
                    if m:
                        current_ky = int(m.group(0))
            continue

        if ky.isdigit():
            current_ky = int(ky)

        if ma and ma != 'None' and not ma.startswith('I') and not ma.startswith('II') and not 'STT' in stt and not 'Mã HP' in ma:
            if current_ky > 0:
                part2_sem_map[ma] = current_ky

    # 3. Cập nhật `isOrganized` và `semester` cho từng môn
    for c in courses:
        code = c['courseCode']
        is_in_col_b = c['excelSemester'] is not None and c['excelSemester'] > 0
        is_in_part2 = code in part2_sem_map

        if is_in_part2 or is_in_col_b:
            c['isOrganized'] = True
            c['semester'] = part2_sem_map.get(code, c['excelSemester'] or 1)
        else:
            c['isOrganized'] = False
            c['semester'] = None

    # 4. Tính toán tổng số tín chỉ tích lũy tốt nghiệp chuẩn (Deduplicate theo courseCode)
    seen_codes = set()
    organized_non_condition = []
    for c in courses:
        if c['isOrganized'] and not c['isCondition'] and c['courseCode'] not in seen_codes:
            seen_codes.add(c['courseCode'])
            organized_non_condition.append(c)

    total_graduation_credits = sum(c['credits'] for c in organized_non_condition)
    condition_credits = sum(c['credits'] for c in courses if c['isOrganized'] and c['isCondition'])

    result = {
        'totalCourses': len(courses),
        'totalOrganizedCourses': len([c for c in courses if c['isOrganized']]),
        'totalUnorganizedCourses': len([c for c in courses if not c['isOrganized']]),
        'totalGraduationCredits': total_graduation_credits if total_graduation_credits > 0 else 153,
        'conditionCredits': condition_credits,
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
