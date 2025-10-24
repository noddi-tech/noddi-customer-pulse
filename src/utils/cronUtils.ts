// Calculate the next run time for a cron job
// @param schedule - Cron schedule string (e.g., '0 */2 * * *')
// @returns Next execution time as Date
export function getNextCronRunTime(schedule: string): Date {
  // Parse cron: '0 */2 * * *' = minute hour day month dayOfWeek
  const parts = schedule.split(' ');
  const minute = parts[0];
  const hour = parts[1];
  
  const now = new Date();
  const currentMinute = now.getMinutes();
  const currentHour = now.getHours();
  
  // Simple parser for '0 */2 * * *' pattern (every 2 hours)
  if (hour.startsWith('*/')) {
    const interval = parseInt(hour.substring(2));
    const minuteTarget = parseInt(minute);
    
    // Calculate next hour that matches interval
    let nextHour = currentHour;
    
    // If we've passed the target minute this hour, move to next interval
    if (currentMinute >= minuteTarget) {
      nextHour = Math.ceil((currentHour + 1) / interval) * interval;
    } else {
      // We're before the target minute, check if current hour matches interval
      if (currentHour % interval === 0) {
        nextHour = currentHour;
      } else {
        nextHour = Math.ceil(currentHour / interval) * interval;
      }
    }
    
    const nextRunDate = new Date(now);
    nextRunDate.setHours(nextHour % 24);
    nextRunDate.setMinutes(minuteTarget);
    nextRunDate.setSeconds(0);
    nextRunDate.setMilliseconds(0);
    
    // If calculated time is in the past, add interval
    if (nextRunDate <= now) {
      nextRunDate.setHours(nextRunDate.getHours() + interval);
    }
    
    return nextRunDate;
  }
  
  // Fallback: return 2 hours from now
  const fallback = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  return fallback;
}
