import { Lead } from '@omni/shared';

export const getStatusColor = (status: string) => {
  switch (status) {
    case 'Pending': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
    case 'Waiting': return 'bg-orange-100 text-orange-600 border-orange-200';
    case 'Called': return 'bg-blue-100 text-blue-600 border-blue-200';
    case 'Serving': return 'bg-purple-100 text-purple-600 border-purple-200';
    case 'Completed': return 'bg-green-100 text-green-600 border-green-200';
    case 'No-Show': return 'bg-red-100 text-red-600 border-red-200';
    case 'Cancelled': return 'bg-gray-200 text-gray-700 border-gray-300';
    default: return 'bg-gray-100 text-gray-600 border-gray-200';
  }
};

export const getStaffStatusColor = (status: string) => {
  switch (status) {
    case 'online': return 'bg-green-100 text-green-600';
    case 'busy': return 'bg-orange-100 text-orange-600';
    case 'offline': return 'bg-gray-200 text-gray-600';
    default: return 'bg-gray-100 text-gray-600';
  }
};

export const computeHeatmap = (leads: Lead[]) => {
  const hours = new Array(24).fill(0);
  leads.forEach(l => {
    const d = new Date(l.timestamp);
    if (!isNaN(d.getTime())) {
      hours[d.getHours()]++;
    }
  });
  const maxVal = Math.max(...hours, 1);
  return hours.map(count => Math.round((count / maxVal) * 100));
};

export const exportCSV = (leads: Lead[]) => {
  const headers = ['Ticket', 'Service', 'Source', 'Status', 'Priority', 'Staff', 'Email', 'Phone', 'Wait Time', 'Created', 'Feedback Rating'];
  const rows = leads.map(l => [
    l.ticketNumber,
    l.service,
    l.source,
    l.status,
    l.priority ? 'Yes' : 'No',
    l.staff || '',
    l.email,
    l.phone,
    l.predictedWaitTime,
    new Date(l.timestamp).toISOString(),
    l.feedback?.rating || ''
  ]);
  const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `omni-queue-tickets-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

// ── Advanced BI Analytics Helpers ────────────────────────────────────────

/** Distribution of ticket statuses for a donut chart. */
export const computeStatusDistribution = (leads: Lead[]) => {
  const counts: Record<string, number> = {};
  leads.forEach(l => {
    counts[l.status] = (counts[l.status] || 0) + 1;
  });
  return Object.entries(counts)
    .map(([status, count]) => ({ status, count, pct: leads.length > 0 ? Math.round((count / leads.length) * 100) : 0 }))
    .sort((a, b) => b.count - a.count);
};

/** On-site vs Remote source split. */
export const computeSourceDistribution = (leads: Lead[]) => {
  let onSite = 0;
  let remote = 0;
  leads.forEach(l => {
    if (l.source === 'Remote') remote++;
    else onSite++;
  });
  const total = onSite + remote || 1;
  return {
    onSite: { count: onSite, pct: Math.round((onSite / total) * 100) },
    remote: { count: remote, pct: Math.round((remote / total) * 100) }
  };
};

/** Star rating distribution (1-5). */
export const computeCSATDistribution = (leads: Lead[]) => {
  const stars = [0, 0, 0, 0, 0]; // index 0 = 1-star, index 4 = 5-star
  let total = 0;
  leads.forEach(l => {
    if (l.feedback?.rating) {
      stars[l.feedback.rating - 1]++;
      total++;
    }
  });
  return stars.map((count, i) => ({
    star: i + 1,
    count,
    pct: total > 0 ? Math.round((count / total) * 100) : 0
  }));
};

/** Average wait time by service (position). */
export const computeServiceTimeByPosition = (leads: Lead[]) => {
  const byPosition: Record<string, { total: number; count: number }> = {};
  leads.forEach(l => {
    if (!l.assignedPosition || !l.predictedWaitTime) return;
    if (!byPosition[l.assignedPosition]) byPosition[l.assignedPosition] = { total: 0, count: 0 };
    byPosition[l.assignedPosition].total += l.predictedWaitTime;
    byPosition[l.assignedPosition].count++;
  });
  return Object.entries(byPosition)
    .map(([position, data]) => ({
      position,
      avgWait: Math.round(data.total / data.count),
      ticketCount: data.count
    }))
    .sort((a, b) => b.avgWait - a.avgWait);
};

/** Staff performance leaderboard. */
export const computeStaffPerformance = (leads: Lead[]) => {
  const byStaff: Record<string, { served: number; totalWait: number; ratings: number[]; }> = {};
  leads.forEach(l => {
    if (!l.staff) return;
    if (!byStaff[l.staff]) byStaff[l.staff] = { served: 0, totalWait: 0, ratings: [] };
    if (l.status === 'Completed') byStaff[l.staff].served++;
    byStaff[l.staff].totalWait += l.predictedWaitTime || 0;
    if (l.feedback?.rating) byStaff[l.staff].ratings.push(l.feedback.rating);
  });
  return Object.entries(byStaff)
    .map(([staff, data]) => ({
      staff,
      served: data.served,
      avgWait: data.served > 0 ? Math.round(data.totalWait / data.served) : 0,
      avgRating: data.ratings.length > 0 ? +(data.ratings.reduce((a, b) => a + b, 0) / data.ratings.length).toFixed(1) : null,
      ratingCount: data.ratings.length
    }))
    .sort((a, b) => b.served - a.served);
};

/** No-show rate. */
export const computeNoShowRate = (leads: Lead[]) => {
  const noShows = leads.filter(l => l.status === 'No-Show').length;
  const terminal = leads.filter(l => ['Completed', 'No-Show', 'Cancelled'].includes(l.status)).length;
  return {
    count: noShows,
    total: terminal,
    rate: terminal > 0 ? Math.round((noShows / terminal) * 100) : 0
  };
};

