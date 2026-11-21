'use client';
import React, { useCallback } from 'react';
import { ArrowRight, ExternalLink, Sparkles } from 'lucide-react';
import { requestAssistant } from '../components/ai/AssistantContext';
import { parseBookTarget, validStudyTarget } from '../../shared/study-notes';
import { linkOpensNewTab } from '../../shared/workspace-tabs';
import { useTabsOptional, useWorkspace } from '../components/context/WorkspaceContext';
import type { MenuItemProps } from '../components/ui/Menu';
import { navigateStudyReference, openStudyNote, studyTargetTitle, studyTargetView } from './study-navigation';

export interface LinkOpenOptions {
  ctrl?: boolean;
  meta?: boolean;
  middle?: boolean;
  /** Explicit override from the right-click menu ("Open in new tab" / "Open here"). */
  inNewTab?: boolean;
  /** Optional title for a newly opened tab. */
  title?: string;
  /** Called before navigating (for closing overlays, drawers, or tooltips). */
  onBeforeOpen?: () => void;
}

export function linkClickModifiers(event?: { ctrlKey?: boolean; metaKey?: boolean; button?: number }): Pick<LinkOpenOptions, 'ctrl' | 'meta' | 'middle'> {
  if (!event) return {};
  return { ctrl: event.ctrlKey, meta: event.metaKey, middle: event.button === 1 };
}

/**
 * Shared content-link opener for notes, relations, personal lists, search results, and hover cards.
 * Follows `workspace.prefs.v1` ("Open links in": new tab / same tab), flips on Ctrl/Cmd/middle-click,
 * and builds the "Open in new tab" / "Open here" right-click menu items.
 */
export function useOpenStudyLink() {
  const { books, openBookForReading, t } = useWorkspace();
  const tabs = useTabsOptional();

  const openLink = useCallback(async (target: string, options?: LinkOpenOptions): Promise<void> => {
    if (!validStudyTarget(target)) throw new Error('invalid-reference');
    const shouldOpenNewTab = !!tabs && (options?.inNewTab ?? linkOpensNewTab(tabs.prefs, {
      ctrl: options?.ctrl,
      meta: options?.meta,
      middle: options?.middle,
    }));

    if (!shouldOpenNewTab || !tabs) {
      options?.onBeforeOpen?.();
      await navigateStudyReference(
        target,
        books,
        openBookForReading,
        (id, anchor) => openStudyNote({ id, anchor }),
      );
      return;
    }

    const view = studyTargetView(target, books);
    if (!view) throw new Error('invalid-reference');
    if (target.startsWith('book:')) {
      const parsed = parseBookTarget(target);
      if (!parsed || !books.some(book => book.id === parsed.id)) throw new Error('missing-book');
    }

    const afterId = tabs.state.tabs[tabs.state.tabs.length - 1]?.id;
    const title = options?.title || studyTargetTitle(target, books);
    options?.onBeforeOpen?.();
    const tabId = tabs.open({ view, target, title }, { afterId });
    try {
      await navigateStudyReference(
        target,
        books,
        () => {},
        (id, anchor) => openStudyNote({ id, anchor, tabId }),
        tabId,
      );
    } catch (error) {
      tabs.close(tabId);
      throw error;
    }
  }, [tabs, books, openBookForReading]);

  const linkMenuItems = useCallback((
    target: string,
    options?: {
      title?: string;
      onBeforeOpen?: () => void;
      onError?: () => void;
      onOpen?: (opts: LinkOpenOptions) => void;
    },
  ): MenuItemProps[] => {
    const run = (inNewTab: boolean) => {
      const opts: LinkOpenOptions = {
        inNewTab,
        ...(options?.title ? { title: options.title } : {}),
        ...(options?.onBeforeOpen ? { onBeforeOpen: options.onBeforeOpen } : {}),
      };
      if (options?.onOpen) {
        options.onOpen(opts);
        return;
      }
      void openLink(target, opts).catch(() => options?.onError?.());
    };
    return [
      {
        id: 'open-in-new-tab',
        label: t('ctxOpenInNewTab'),
        icon: React.createElement(ExternalLink, { className: 'size-4' }),
        onClick: () => run(true),
      },
      {
        id: 'open-here',
        label: t('ctxOpenHere'),
        icon: React.createElement(ArrowRight, { className: 'size-4 rtl:rotate-180' }),
        onClick: () => run(false),
      },
      {
        id: 'add-to-ai',
        label: t('ctxAddToAiConversation'),
        icon: React.createElement(Sparkles, { className: 'size-4' }),
        onClick: () => requestAssistant({ sources: [{ target, label: options?.title || target }] }),
      },
    ];
  }, [openLink, t]);

  const linkHandlers = useCallback((
    target: string,
    options?: {
      title?: string;
      onBeforeOpen?: () => void;
      onError?: () => void;
      onOpen?: (opts: LinkOpenOptions) => void;
    },
  ) => {
    const trigger = (event: React.MouseEvent) => {
      const mods = linkClickModifiers(event);
      const opts: LinkOpenOptions = {
        ...mods,
        ...(options?.title ? { title: options.title } : {}),
        ...(options?.onBeforeOpen ? { onBeforeOpen: options.onBeforeOpen } : {}),
      };
      if (options?.onOpen) {
        options.onOpen(opts);
        return;
      }
      void openLink(target, opts).catch(() => options?.onError?.());
    };
    return {
      onClick: (event: React.MouseEvent) => {
        trigger(event);
      },
      onMouseDown: (event: React.MouseEvent) => {
        if (event.button === 1) event.preventDefault();
      },
      onAuxClick: (event: React.MouseEvent) => {
        if (event.button === 1) {
          event.preventDefault();
          trigger(event);
        }
      },
    };
  }, [openLink]);

  return { openLink, linkMenuItems, linkHandlers };
}
