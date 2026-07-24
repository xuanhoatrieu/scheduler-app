/**
 * Shared attendance statistics calculation utilities.
 * Extracted to eliminate duplication across inspector routes.
 */

/**
 * Calculate summary stats from an array of Attendance records.
 * @param {Array} records - Array of Attendance model instances
 * @param {Object} [opts] - Options
 * @param {boolean} [opts.includeAverages=false] - Also compute avgLateMinutes / avgEarlyMinutes
 * @returns {Object} Summary with counts and percentages
 */
const calculateSummary = (records, { includeAverages = false } = {}) => {
  const totalRecords = records.length;
  const onTime = records.filter(r => r.status === 'on_time').length;
  const late = records.filter(r => r.status === 'late').length;
  const earlyLeave = records.filter(r => r.status === 'early_leave').length;
  const absent = records.filter(r => r.status === 'absent').length;
  const exempt = records.filter(r => r.status === 'exempt').length;

  const summary = {
    totalRecords,
    onTime,
    late,
    earlyLeave,
    absent,
    exempt,
    onTimePercent: 0,
    latePercent: 0,
    earlyLeavePercent: 0,
    absentPercent: 0,
  };

  if (totalRecords > 0) {
    summary.onTimePercent = Math.round((onTime / totalRecords) * 100);
    summary.latePercent = Math.round((late / totalRecords) * 100);
    summary.earlyLeavePercent = Math.round((earlyLeave / totalRecords) * 100);
    summary.absentPercent = Math.round((absent / totalRecords) * 100);
  }

  if (includeAverages) {
    const totalLateMins = records.reduce((sum, r) => sum + (r.lateMinutes || 0), 0);
    const totalEarlyMins = records.reduce((sum, r) => sum + (r.earlyMinutes || 0), 0);
    const lateRecords = records.filter(r => r.status === 'late');
    const earlyRecords = records.filter(r => r.status === 'early_leave');

    summary.avgLateMinutes = lateRecords.length > 0 ? Math.round(totalLateMins / lateRecords.length) : 0;
    summary.avgEarlyMinutes = earlyRecords.length > 0 ? Math.round(totalEarlyMins / earlyRecords.length) : 0;
  }

  return summary;
};

/**
 * Group attendance records by lecturer and compute per-lecturer stats.
 * @param {Array} records - Array of Attendance model instances
 * @param {Map<string,string>} [nameMap] - Map of lecturerId -> display name
 * @returns {Array} Sorted array of lecturer stat objects
 */
const groupByLecturer = (records, nameMap = {}) => {
  const byLecturer = {};

  for (const r of records) {
    if (!byLecturer[r.lecturerId]) {
      byLecturer[r.lecturerId] = {
        lecturerId: r.lecturerId,
        totalClasses: 0,
        onTime: 0,
        late: 0,
        earlyLeave: 0,
        absent: 0,
        exempt: 0,
        totalLateMinutes: 0,
        totalEarlyMinutes: 0,
      };
    }
    const g = byLecturer[r.lecturerId];
    g.totalClasses++;
    g[r.status]++;
    g.totalLateMinutes += r.lateMinutes || 0;
    g.totalEarlyMinutes += r.earlyMinutes || 0;
  }

  return Object.values(byLecturer)
    .map(g => ({
      ...g,
      lecturerName: nameMap[g.lecturerId] || 'N/A',
      onTimePercent: g.totalClasses > 0 ? Math.round((g.onTime / g.totalClasses) * 100) : 0,
    }))
    .sort((a, b) => b.late - a.late);
};

module.exports = { calculateSummary, groupByLecturer };
