import openpyxl
import json

wb = openpyxl.load_workbook('/home/trieuhoa/lichhoc-app/cndmstk56.xlsx', data_only=True)
ws = wb.active

rows_data = []
for r in range(1, 160):
    row_vals = []
    for c in range(1, 15):
        val = ws.cell(row=r, column=c).value
        row_vals.append(str(val) if val is not None else '')
    if any(row_vals):
        rows_data.append({'row': r, 'cells': row_vals})

with open('/home/trieuhoa/lichhoc-app/backend/excel_dump.json', 'w', encoding='utf-8') as f:
    json.dump(rows_data, f, ensure_ascii=False, indent=2)
print("Dumped", len(rows_data), "rows")
