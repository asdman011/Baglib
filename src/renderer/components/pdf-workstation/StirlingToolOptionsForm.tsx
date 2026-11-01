'use client';
import React from 'react';
import { Upload, X } from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { STIRLING_TOOL_OPTIONS, applyToolOption, optionVisible, type ToolOption, type ToolOptionValues } from './stirling-tool-options';

interface StirlingToolOptionsFormProps {
  toolId: string;
  values: ToolOptionValues;
  onChange: (values: ToolOptionValues) => void;
  isDark: boolean;
}

const fileName = (filePath: string) => filePath.split(/[/\\]/u).pop();

export function StirlingToolOptionsForm({ toolId, values, onChange, isDark }: StirlingToolOptionsFormProps) {
  const { t } = useWorkspace();
  const options = (STIRLING_TOOL_OPTIONS[toolId] ?? []).filter(option => optionVisible(option, values));
  if (!options.length) {
    return <p data-stirling-no-options className={`text-[11px] leading-relaxed ${isDark ? 'text-[#8b92a5]' : 'text-[#64748b]'}`}>{t('stirlingOptNoOptions')}</p>;
  }
  const set = (name: string, value: ToolOptionValues[string]) => onChange(applyToolOption(toolId, values, name, value));
  const field = `w-full p-2 rounded-lg border outline-none text-xs ${isDark ? 'bg-[#121418] border-[#282d3b] text-white' : 'bg-white border-[#cbd5e1] text-[#0f172a]'}`;
  const muted = `text-[10px] leading-relaxed block ${isDark ? 'text-[#8b92a5]' : 'text-[#64748b]'}`;
  const label = `text-[11px] font-semibold block ${isDark ? 'text-[#c3c8d4]' : 'text-[#334155]'}`;

  const chooseFiles = async (option: ToolOption) => {
    const chosen = await window.electronAPI?.pdfEditor?.chooseToolFiles?.(option.extensions ?? ['pdf'], option.kind === 'files');
    if (chosen?.ok !== true || !chosen.data.length) return;
    if (option.kind === 'file') set(option.name, chosen.data[0]);
    else set(option.name, [...((values[option.name] as string[] | undefined) ?? []), ...chosen.data]);
  };

  const control = (option: ToolOption) => {
    const value = values[option.name];
    if (option.kind === 'select') {
      return (
        <select
          aria-label={t(option.label)}
          value={String(value ?? '')}
          onChange={event => set(option.name, option.choices?.find(choice => String(choice.value) === event.target.value)?.value ?? event.target.value)}
          className={field}
        >
          {option.choices?.map(choice => <option key={choice.value} value={choice.value}>{t(choice.label)}</option>)}
        </select>
      );
    }
    if (option.kind === 'textarea') return <textarea aria-label={t(option.label)} dir="auto" rows={3} value={String(value ?? '')} onChange={event => set(option.name, event.target.value)} className={field} />;
    if (option.kind === 'color') return <input aria-label={t(option.label)} type="color" value={String(value ?? '#000000')} onChange={event => set(option.name, event.target.value)} className="h-8 w-14 rounded border border-subtle bg-transparent cursor-pointer" />;
    if (option.kind === 'file' || option.kind === 'files') {
      const files = option.kind === 'file' ? (value ? [String(value)] : []) : (value as string[] | undefined) ?? [];
      return (
        <div className="space-y-1.5">
          {files.map(file => (
            <div key={file} className={`flex items-center gap-2 rounded-lg border px-2 py-1 text-[11px] ${isDark ? 'border-[#282d3b] text-white' : 'border-[#cbd5e1] text-[#0f172a]'}`}>
              <span dir="auto" className="flex-1 min-w-0 truncate" title={file}>{fileName(file)}</span>
              <button type="button" aria-label={t('stirlingOptRemoveFile')} title={t('stirlingOptRemoveFile')} onClick={() => set(option.name, option.kind === 'file' ? '' : files.filter(item => item !== file))} className="text-red-500 cursor-pointer">
                <X size={12} />
              </button>
            </div>
          ))}
          {(option.kind === 'files' || !files.length) && (
            <button type="button" onClick={() => void chooseFiles(option)} className={`flex items-center gap-1.5 rounded-lg border border-dashed px-2.5 py-1.5 text-[11px] font-semibold cursor-pointer ${isDark ? 'border-[#32384a] text-[#c3c8d4]' : 'border-[#cbd5e1] text-[#334155]'}`}>
              <Upload size={12} />
              {t(option.kind === 'files' ? 'stirlingOptChooseFiles' : 'stirlingOptChooseFile')}
            </button>
          )}
        </div>
      );
    }
    const numeric = option.kind === 'number';
    return (
      <input
        aria-label={t(option.label)}
        type={option.kind === 'password' ? 'password' : numeric ? 'number' : 'text'}
        autoComplete="off"
        dir={option.kind === 'password' || option.kind === 'pages' || numeric ? 'ltr' : 'auto'}
        min={option.min}
        max={option.max}
        step={option.step}
        value={String(value ?? '')}
        onChange={event => set(option.name, numeric && event.target.value !== '' ? Number(event.target.value) : event.target.value)}
        className={field}
      />
    );
  };

  return (
    <div data-stirling-tool-options className={`p-4 rounded-xl border space-y-3 ${isDark ? 'bg-[#181a20] border-[#262a34]' : 'bg-[#f8fafc] border-[#e2e8f0]'}`}>
      <span className={`text-xs font-bold block ${isDark ? 'text-white' : 'text-[#0f172a]'}`}>{t('stirlingOptionsHeading')}</span>
      {options.map(option => option.kind === 'toggle' ? (
        <label key={`${option.name}:${option.label}`} className="flex items-start gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={values[option.name] === true} onChange={event => set(option.name, event.target.checked)} className="mt-0.5 rounded accent-emerald-600 cursor-pointer" />
          <span className="min-w-0">
            <span className={label}>{t(option.label)}</span>
            {option.hint && <span className={muted}>{t(option.hint)}</span>}
          </span>
        </label>
      ) : (
        <div key={`${option.name}:${option.label}`} className="space-y-1">
          <span className={label}>
            {t(option.label)}
            {option.required && <span aria-hidden="true" className="text-red-500 ms-0.5">*</span>}
          </span>
          {control(option)}
          {option.hint && <span className={muted}>{t(option.hint)}</span>}
        </div>
      ))}
    </div>
  );
}
