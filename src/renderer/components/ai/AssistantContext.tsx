'use client';
/**
 * KEY-384: state for the app-wide assistant, kept above the views so the conversation and the attached sources stay
 * when the user moves between tabs. A view can register what is open on it (the editor: the chapter, its selection
 * and "insert into chapter"); anything can open the assistant with sources attached.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatAction, ChatSourceRef } from '../../../shared/assistant-chat';
import type { ResearchAiCitation } from '../../../shared/research-ai';

export interface AssistantPage {
  /** Shown as the context chip, for example the chapter title. */
  label: string;
  chapterId?: string;
  selectedText?: () => string;
  insert?: (text: string) => Promise<unknown>;
  /** Saves pending edits so the request reads the latest text. */
  flush?: () => Promise<void>;
}
export type AssistantMessage =
  | { id: number; role: 'user'; text: string; action?: ChatAction }
  | { id: number; role: 'assistant'; text: string; citations: ResearchAiCitation[]; sourceCount: number; inserted?: boolean }
  | { id: number; role: 'error'; text: string; settings?: boolean };

interface AssistantValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  messages: AssistantMessage[];
  setMessages: React.Dispatch<React.SetStateAction<AssistantMessage[]>>;
  sources: ChatSourceRef[];
  setSources: React.Dispatch<React.SetStateAction<ChatSourceRef[]>>;
  page: AssistantPage | null;
  registerPage: (page: AssistantPage) => () => void;
  /** Opens the panel, attaching sources (kept unique) and optionally filling the input. */
  openWith: (options?: { sources?: ChatSourceRef[]; prompt?: string }) => void;
  draft: string;
  setDraft: (value: string) => void;
  /** KEY-436: true when a revision session or test/exam modal is currently active. */
  inRevisionOrTest: boolean;
  registerRevisionContext: () => () => void;
}

const AssistantCtx = createContext<AssistantValue | null>(null);
export const OPEN_ASSISTANT_EVENT = 'baglib:open-assistant';

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [sources, setSources] = useState<ChatSourceRef[]>([]);
  const [page, setPage] = useState<AssistantPage | null>(null);
  const [draft, setDraft] = useState('');
  const [revisionCount, setRevisionCount] = useState(0);
  const token = useRef(0);
  const registerPage = useCallback((next: AssistantPage) => {
    const mine = ++token.current;
    setPage(next);
    return () => { if (token.current === mine) setPage(null); };
  }, []);
  const registerRevisionContext = useCallback(() => {
    setRevisionCount(c => c + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      setRevisionCount(c => Math.max(0, c - 1));
    };
  }, []);
  const openWith = useCallback((options?: { sources?: ChatSourceRef[]; prompt?: string }) => {
    if (options?.sources?.length) setSources(current => [...current, ...options.sources!.filter(ref => !current.some(item => item.target === ref.target))].slice(0, 20));
    if (options?.prompt) setDraft(options.prompt);
    setOpen(true);
  }, []);
  useEffect(() => {
    const handler = (event: Event) => openWith((event as CustomEvent<{ sources?: ChatSourceRef[]; prompt?: string }>).detail);
    window.addEventListener(OPEN_ASSISTANT_EVENT, handler);
    return () => window.removeEventListener(OPEN_ASSISTANT_EVENT, handler);
  }, [openWith]);
  const value = useMemo(() => ({ open, setOpen, messages, setMessages, sources, setSources, page, registerPage, openWith, draft, setDraft, inRevisionOrTest: revisionCount > 0, registerRevisionContext }), [open, messages, sources, page, registerPage, openWith, draft, revisionCount, registerRevisionContext]);
  return <AssistantCtx.Provider value={value}>{children}</AssistantCtx.Provider>;
}

/** Outside the provider (a view rendered on its own, as in tests) opening goes through the window event. */
const detached: AssistantValue = {
  open: false, setOpen: () => {}, messages: [], setMessages: () => {}, sources: [], setSources: () => {}, page: null,
  registerPage: () => () => {}, openWith: options => requestAssistant(options ?? {}), draft: '', setDraft: () => {},
  inRevisionOrTest: false, registerRevisionContext: () => () => {},
};

export function useAssistant(): AssistantValue {
  return useContext(AssistantCtx) ?? detached;
}

/** Registers that a revision session or test is active while `active` is true. */
export function useRegisterRevisionContext(active: boolean) {
  const { registerRevisionContext } = useAssistant();
  useEffect(() => {
    if (!active) return;
    return registerRevisionContext();
  }, [active, registerRevisionContext]);
}

/** For code outside the provider tree: opens the assistant with sources attached. */
export function requestAssistant(options: { sources?: ChatSourceRef[]; prompt?: string }) {
  window.dispatchEvent(new CustomEvent(OPEN_ASSISTANT_EVENT, { detail: options }));
}
