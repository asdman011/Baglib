'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  ListTodo,
} from 'lucide-react';
import { taskCountLabel } from '../../utils/task-count';
import { useWorkspace } from '../context/WorkspaceContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';
import { EmptyState } from '../ui/EmptyState';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { civilDate, parseCivilDate, addCivilDays, type StudyTask } from '../../../shared/study-planner';
import { calculateHijriDate } from '../../../shared/athan-calculator';
import type { CurriculumExamConfig } from '../../../shared/curriculum-exam';

export interface CalendarExamItem {
  pathwayId: string;
  pathwayTitle: string;
  examDate: string; // YYYY-MM-DD
}

export function formatHijriForDay(date: Date, lang: string): { dayStr: string; label: string } {
  try {
    const locale = lang === 'ar' ? 'ar-SA-u-ca-islamic-umalqura' : 'en-US-u-ca-islamic-umalqura';
    const dayFormatter = new Intl.DateTimeFormat(locale, { day: 'numeric' });
    const fullFormatter = new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    return {
      dayStr: dayFormatter.format(date),
      label: fullFormatter.format(date),
    };
  } catch {
    const info = calculateHijriDate(date);
    return {
      dayStr: lang === 'ar' ? String(info.day).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]) : String(info.day),
      label: lang === 'ar' ? info.formattedAr : info.formattedEn,
    };
  }
}

export const DashboardCalendarModule: React.FC = () => {
  const { lang, dir, t, setViewMode } = useWorkspace();

  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string>(() => civilDate(new Date()));
  const [tasks, setTasks] = useState<StudyTask[]>([]);
  const [exams, setExams] = useState<CalendarExamItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-based

  useEffect(() => {
    let alive = true;
    const fetchAll = async () => {
      try {
        const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
        const taskPromise = api?.planner?.list ? api.planner.list() : Promise.resolve([]);
        const pathwaysPromise = api?.pathways?.list ? api.pathways.list() : Promise.resolve([]);

        const [loadedTasks, loadedPathways] = await Promise.all([taskPromise, pathwaysPromise]);
        if (!alive) return;
        if (Array.isArray(loadedTasks)) {
          setTasks(loadedTasks);
        }

        if (Array.isArray(loadedPathways) && api?.pathwayExam?.getConfig) {
          const examResults: CalendarExamItem[] = [];
          for (const p of loadedPathways) {
            try {
              const config: CurriculumExamConfig = await api.pathwayExam.getConfig(p.id);
              if (config && config.examDate) {
                examResults.push({
                  pathwayId: p.id,
                  pathwayTitle: p.name || p.title || p.id, // KEY-308: pathways carry `name`; `title` was always undefined, so the UUID showed.
                  examDate: config.examDate,
                });
              }
            } catch {}
          }
          if (alive) {
            setExams(examResults);
          }
        }
      } catch {
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    };
    void fetchAll();
    return () => {
      alive = false;
    };
  }, []);

  // Calendar days grid
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0=Sun..6=Sat

  // Month navigation
  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };
  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };
  const handleToday = () => {
    const now = new Date();
    setCurrentDate(now);
    setSelectedDate(civilDate(now));
  };

  let monthYearLabel = `${month + 1}/${year}`;
  try {
    monthYearLabel = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-US', {
      month: 'long',
      year: 'numeric',
    }).format(new Date(year, month, 1));
  } catch {}

  // Weekday abbreviations
  const weekdayNames: string[] = [];
  const sunday = new Date(2026, 10, 1); // Nov 1, 2026 is Sunday
  for (let i = 0; i < 7; i++) {
    const d = addCivilDays(sunday, i);
    try {
      weekdayNames.push(
        new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA' : 'en-US', {
          weekday: 'narrow',
        }).format(d)
      );
    } catch {
      weekdayNames.push(String(i));
    }
  }

  // Filter tasks & exams for selected day
  const selectedDayTasks = useMemo(() => {
    return tasks.filter((t) => t.dueDate === selectedDate || t.startDate === selectedDate);
  }, [tasks, selectedDate]);

  const selectedDayExams = useMemo(() => {
    return exams.filter((e) => e.examDate === selectedDate);
  }, [exams, selectedDate]);

  const selectedDateObj = useMemo(() => {
    try {
      return parseCivilDate(selectedDate);
    } catch {
      return new Date();
    }
  }, [selectedDate]);

  const selectedHijriInfo = useMemo(() => {
    return formatHijriForDay(selectedDateObj, lang);
  }, [selectedDateObj, lang]);

  const todayIso = useMemo(() => civilDate(new Date()), []);

  return (
    <Card
      data-dashboard-module="calendar"
      className="p-0 overflow-hidden"
      dir={dir}
    >
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 border-b border-border bg-surface-raised/40">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 rounded-2xl bg-primary/10 border border-primary/20 text-primary-text shrink-0">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <CardTitle className="truncate">{t('dashCalendarTitle')}</CardTitle>
            <CardDescription className="truncate">
              {t('dashCalendarSubtitle')}
            </CardDescription>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleToday}
            className="text-xs px-2.5 py-1"
          >
            {t('dashCalendarToday')}
          </Button>

          <button
            type="button"
            aria-label={t('dashCalendarPrevious')}
            title={t('dashCalendarPrevious')}
            onClick={handlePrevMonth}
            className="p-1.5 rounded-xl border border-border bg-canvas hover:bg-surface text-text-muted hover:text-text transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
          </button>

          <span className="font-display font-bold text-xs text-text px-2 min-w-[7rem] text-center">
            {monthYearLabel}
          </span>

          <button
            type="button"
            aria-label={t('dashCalendarNext')}
            title={t('dashCalendarNext')}
            onClick={handleNextMonth}
            className="p-1.5 rounded-xl border border-border bg-canvas hover:bg-surface text-text-muted hover:text-text transition-colors cursor-pointer"
          >
            <ChevronRight className="w-4 h-4 rtl:rotate-180" />
          </button>
        </div>
      </CardHeader>

      <CardContent className="p-3 sm:p-5 space-y-4">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : (
          <>
            {/* 7-column Calendar Grid */}
            <div className="overflow-x-auto">
              <div className="min-w-[18rem] space-y-1">
                {/* Weekday headers */}
                <div className="grid grid-cols-7 gap-1 text-center pb-1">
                  {weekdayNames.map((name, i) => (
                    <div
                      key={i}
                      className="text-[11px] font-bold text-text-muted uppercase tracking-wider"
                    >
                      {name}
                    </div>
                  ))}
                </div>

                {/* Day cells */}
                <div className="grid grid-cols-7 gap-1">
                  {/* Empty offset days */}
                  {Array.from({ length: firstDayOfWeek }).map((_, index) => (
                    <div
                      key={`empty-${index}`}
                      className="min-h-[3.25rem] p-1 rounded-xl bg-canvas/20 border border-transparent"
                      aria-hidden="true"
                    />
                  ))}

                  {/* Month days */}
                  {Array.from({ length: daysInMonth }).map((_, index) => {
                    const dayNum = index + 1;
                    const cellDate = new Date(year, month, dayNum);
                    const cellIso = civilDate(cellDate);
                    const isSelected = cellIso === selectedDate;
                    const isToday = cellIso === todayIso;

                    const hijri = formatHijriForDay(cellDate, lang);

                    const dayTasks = tasks.filter(
                      (t) => t.dueDate === cellIso || t.startDate === cellIso
                    );
                    const dayExams = exams.filter((e) => e.examDate === cellIso);
                    const hasEvents = dayTasks.length > 0 || dayExams.length > 0;

                    const gregDayStr =
                      lang === 'ar'
                        ? String(dayNum).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)])
                        : String(dayNum);

                    return (
                      <button
                        key={cellIso}
                        type="button"
                        data-calendar-day={cellIso}
                        onClick={() => setSelectedDate(cellIso)}
                        className={`min-h-[3.5rem] p-1.5 rounded-xl border flex flex-col justify-between items-center transition-all cursor-pointer text-center relative ${
                          isSelected
                            ? 'border-primary ring-2 ring-primary/30 bg-primary/10 shadow-xs'
                            : isToday
                            ? 'border-accent/60 bg-accent/5'
                            : 'border-border/60 bg-surface hover:border-border hover:bg-surface-raised'
                        }`}
                      >
                        {/* Gregorian Day (Top) */}
                        <div className="flex items-center justify-between w-full">
                          <span
                            className={`text-xs font-bold ${
                              isSelected
                                ? 'text-primary-text'
                                : isToday
                                ? 'text-accent font-black'
                                : 'text-text'
                            }`}
                          >
                            {gregDayStr}
                          </span>
                          {hasEvents && (
                            <span className="flex items-center gap-0.5">
                              {dayExams.length > 0 && (
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                              )}
                              {dayTasks.length > 0 && (
                                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                              )}
                            </span>
                          )}
                        </div>

                        {/* Hijri Date (Under each Gregorian day) */}
                        <span
                          data-hijri-date
                          className={`text-[10px] leading-tight font-medium ${
                            isSelected
                              ? 'text-primary-text font-bold'
                              : 'text-text-muted/80'
                          }`}
                          title={hijri.label}
                        >
                          {hijri.dayStr}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Selected Day Inspector */}
            <div
              data-calendar-selected-day-inspector
              className="p-3 sm:p-4 rounded-xl bg-canvas border border-border space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/80 pb-2">
                <div className="flex items-center gap-2">
                  <span className="font-display font-bold text-sm text-text">
                    {new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    }).format(selectedDateObj)}
                  </span>
                  <span className="text-xs text-text-muted">·</span>
                  <span
                    data-selected-hijri-badge
                    className="text-xs font-medium text-primary-text bg-primary/10 px-2 py-0.5 rounded-md border border-primary/20"
                  >
                    {selectedHijriInfo.label}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {selectedDayTasks.length > 0 && (
                    <span className="text-xs text-text-muted font-medium">
                      {taskCountLabel(selectedDayTasks.length, lang, t)}
                    </span>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setViewMode('planner')}
                    className="text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <ListTodo className="w-3.5 h-3.5" />
                    <span>{t('dashCalendarOpenPlanner')}</span>
                  </Button>
                </div>
              </div>

              {selectedDayTasks.length === 0 && selectedDayExams.length === 0 ? (
                <EmptyState
                  className="p-4 sm:p-6"
                  icon={<CalendarIcon className="w-5 h-5 text-text-muted" />}
                  title={t('dashCalendarNoEvents')}
                />
              ) : (
                <div className="space-y-2">
                  {/* Exams */}
                  {selectedDayExams.map((exam) => (
                    <div
                      key={exam.pathwayId}
                      className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25 flex items-center justify-between gap-2 text-xs font-medium text-amber-700 dark:text-amber-300"
                    >
                      <div className="flex items-center gap-2">
                        <GraduationCap className="w-4 h-4 text-amber-500 shrink-0" />
                        <span>{t('dashCalendarExamBadge', { title: exam.pathwayTitle })}</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setViewMode('pathways')}
                        className="text-xs h-6 px-2 text-amber-700 dark:text-amber-300"
                      >
                        {t('dashCalendarOpenCurriculum')}
                      </Button>
                    </div>
                  ))}

                  {/* Tasks */}
                  {selectedDayTasks.map((task) => (
                    <div
                      key={task.id}
                      className="p-2.5 rounded-lg bg-surface border border-border flex items-center justify-between gap-2 text-xs text-text"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <ListTodo className="w-4 h-4 text-primary shrink-0" />
                        <span className="font-medium truncate" dir="auto">
                          {task.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {task.status === 'completed' ? (
                          <Badge variant="success">
                            {t('plannerCompleted')}
                          </Badge>
                        ) : (
                          <Badge variant="primary">
                            {taskCountLabel(1, lang, t)}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
