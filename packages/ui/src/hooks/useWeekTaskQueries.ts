import { useGetTasksForDayQuery, useGetUnscheduledTasksQuery } from "@tudu/store";

export function useWeekTaskQueries(weekDays: string[]) {
  const unscheduledQuery = useGetUnscheduledTasksQuery();
  const day0 = useGetTasksForDayQuery(weekDays[0] ?? "");
  const day1 = useGetTasksForDayQuery(weekDays[1] ?? "");
  const day2 = useGetTasksForDayQuery(weekDays[2] ?? "");
  const day3 = useGetTasksForDayQuery(weekDays[3] ?? "");
  const day4 = useGetTasksForDayQuery(weekDays[4] ?? "");
  const day5 = useGetTasksForDayQuery(weekDays[5] ?? "");
  const day6 = useGetTasksForDayQuery(weekDays[6] ?? "");

  const dayQueries = [day0, day1, day2, day3, day4, day5, day6];

  const isLoading =
    unscheduledQuery.isLoading || dayQueries.some((query) => query.isLoading);
  const isError =
    unscheduledQuery.isError || dayQueries.some((query) => query.isError);

  const tasksByDay = new Map<string, typeof day0.data>();
  weekDays.forEach((day, index) => {
    tasksByDay.set(day, dayQueries[index]?.data);
  });

  return {
    unscheduledQuery,
    dayQueries,
    tasksByDay,
    isLoading,
    isError,
  };
}
