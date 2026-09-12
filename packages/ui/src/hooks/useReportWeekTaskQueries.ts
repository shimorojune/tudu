import { useGetReportDayQuery, useGetReportUnscheduledQuery } from "@tudu/store";

export function useReportWeekTaskQueries(userId: string, weekDays: string[]) {
  const unscheduledQuery = useGetReportUnscheduledQuery(userId, {
    skip: !userId,
  });
  const day0 = useGetReportDayQuery(
    { userId, date: weekDays[0] ?? "" },
    { skip: !userId || !weekDays[0] },
  );
  const day1 = useGetReportDayQuery(
    { userId, date: weekDays[1] ?? "" },
    { skip: !userId || !weekDays[1] },
  );
  const day2 = useGetReportDayQuery(
    { userId, date: weekDays[2] ?? "" },
    { skip: !userId || !weekDays[2] },
  );
  const day3 = useGetReportDayQuery(
    { userId, date: weekDays[3] ?? "" },
    { skip: !userId || !weekDays[3] },
  );
  const day4 = useGetReportDayQuery(
    { userId, date: weekDays[4] ?? "" },
    { skip: !userId || !weekDays[4] },
  );
  const day5 = useGetReportDayQuery(
    { userId, date: weekDays[5] ?? "" },
    { skip: !userId || !weekDays[5] },
  );
  const day6 = useGetReportDayQuery(
    { userId, date: weekDays[6] ?? "" },
    { skip: !userId || !weekDays[6] },
  );

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
