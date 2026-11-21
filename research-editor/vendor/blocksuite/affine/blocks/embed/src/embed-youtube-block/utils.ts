import type {
  EmbedYoutubeBlockUrlData,
  EmbedYoutubeModel,
} from '@blocksuite/affine-model';
import type { LinkPreviewProvider } from '@blocksuite/affine-shared/services';
import { isAbortError } from '@blocksuite/affine-shared/utils';

import type { EmbedYoutubeBlockComponent } from './embed-youtube-block.js';

export async function queryEmbedYoutubeData(
  embedYoutubeModel: EmbedYoutubeModel,
  linkPreviewer: LinkPreviewProvider,
  signal?: AbortSignal
): Promise<Partial<EmbedYoutubeBlockUrlData>> {
  const url = embedYoutubeModel.props.url;

  const videoOpenGraphData = await linkPreviewer
    .query(url, signal)
    .catch(() => ({}));
  const videoOEmbedData = videoOpenGraphData.title
    ? {}
    : await queryYoutubeOEmbedData(url, signal).catch(() => ({}));

  const youtubeEmbedData: Partial<EmbedYoutubeBlockUrlData> = {
    ...videoOpenGraphData,
    ...videoOEmbedData,
  };

  if (!youtubeEmbedData.image && embedYoutubeModel.props.videoId) {
    youtubeEmbedData.image = `https://i.ytimg.com/vi/${embedYoutubeModel.props.videoId}/hqdefault.jpg`;
  }

  if (youtubeEmbedData.creatorUrl) {
    const creatorOpenGraphData = await linkPreviewer
      .query(youtubeEmbedData.creatorUrl, signal)
      .catch(() => ({}));
    youtubeEmbedData.creatorImage = creatorOpenGraphData.image;
  }

  return youtubeEmbedData;
}

export async function queryYoutubeOEmbedData(
  url: string,
  signal?: AbortSignal
): Promise<Partial<EmbedYoutubeBlockUrlData>> {
  let youtubeOEmbedData: Partial<EmbedYoutubeBlockUrlData> = {};

  const oEmbedUrl = `https://youtube.com/oembed?url=${url}&format=json`;

  const oEmbedResponse = await fetch(oEmbedUrl, { signal }).catch(() => null);
  if (oEmbedResponse && oEmbedResponse.ok) {
    const oEmbedJson = await oEmbedResponse.json();
    const { title, author_name, author_url } = oEmbedJson;

    youtubeOEmbedData = {
      title,
      creator: author_name,
      creatorUrl: author_url,
    };
  }

  return youtubeOEmbedData;
}

export async function refreshEmbedYoutubeUrlData(
  embedYoutubeElement: EmbedYoutubeBlockComponent,
  signal?: AbortSignal
): Promise<void> {
  let image = null,
    title = null,
    description = null,
    creator = null,
    creatorUrl = null,
    creatorImage = null;

  try {
    embedYoutubeElement.loading = true;

    // TODO(@mirone): remove service
    const queryUrlData = embedYoutubeElement.service?.queryUrlData;
    if (!queryUrlData) {
      console.error(
        `Trying to refresh youtube url data, but the queryUrlData is not found.`
      );
      return;
    }

    const youtubeUrlData = await queryUrlData(
      embedYoutubeElement.model,
      signal
    );

    ({
      image = null,
      title = null,
      description = null,
      creator = null,
      creatorUrl = null,
      creatorImage = null,
    } = youtubeUrlData);

    if (signal?.aborted) return;

    embedYoutubeElement.store.updateBlock(embedYoutubeElement.model, {
      image,
      title,
      description,
      creator,
      creatorUrl,
      creatorImage,
    });
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) return;
  } finally {
    embedYoutubeElement.loading = false;
  }
}
