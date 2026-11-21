import { css } from 'lit';

export const embedIframeBlockStyles = css`
  .affine-embed-iframe-block-container {
    display: flex;
    width: 100%;
    border-radius: 8px;
    user-select: none;
    align-items: center;
    justify-content: center;
    position: relative;
  }

  .affine-embed-iframe-block-container.in-surface {
    height: 100%;
  }

  .affine-embed-iframe-block-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: none;
  }

  .affine-embed-iframe-source {
    position: absolute;
    left: 8px;
    bottom: 8px;
    padding: 2px 6px;
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
    border-radius: 4px;
    font-size: 12px;
    line-height: 16px;
    pointer-events: none;
  }
  .affine-embed-iframe-block-overlay.show {
    display: block;
  }

  .affine-embed-iframe-preview-card {
    display: flex;
    flex-direction: column;
    width: 100%;
    border-radius: 8px;
    border: 1px solid var(--affine-border-color, rgba(0, 0, 0, 0.12));
    background: var(--affine-background-primary-color, #fff);
    overflow: hidden;
    cursor: pointer;
    text-align: start;
  }

  .affine-embed-iframe-preview-banner {
    width: 100%;
    max-height: 220px;
    overflow: hidden;
    background: var(--affine-background-secondary-color, #f4f4f5);
  }

  .affine-embed-iframe-preview-image {
    display: block;
    width: 100%;
    height: 180px;
    object-fit: cover;
  }

  .affine-embed-iframe-preview-body {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-block: 12px;
    padding-inline: 14px;
  }

  .affine-embed-iframe-preview-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .affine-embed-iframe-preview-icon {
    width: 16px;
    height: 16px;
    border-radius: 3px;
    flex-shrink: 0;
  }

  .affine-embed-iframe-preview-title {
    font-family: var(--affine-font-family);
    font-size: var(--affine-font-sm, 14px);
    font-weight: 600;
    line-height: 20px;
    color: var(--affine-text-primary-color);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .affine-embed-iframe-preview-description {
    font-family: var(--affine-font-family);
    font-size: var(--affine-font-xs, 12px);
    line-height: 18px;
    color: var(--affine-text-secondary-color);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .affine-embed-iframe-preview-host {
    font-family: var(--affine-font-family);
    font-size: var(--affine-font-xs, 12px);
    line-height: 16px;
    color: var(--affine-text-secondary-color);
    opacity: 0.85;
  }
`;
