import type { GetCastRequest, GetCastResponse } from "@lettercast/contracts";

import {
  LETTERCAST_CAST_MARKER,
  renderCastBlock,
} from "./cast-renderer";
import { detectLetterboxdMoviePage } from "./page-identity";

type LifecycleInput = {
  document: Document;
  pageUrl: string | URL;
};

type SendGetCast = (request: GetCastRequest) => Promise<GetCastResponse>;

type RenderCast = typeof renderCastBlock;

type ContentLifecycleDependencies = {
  sendGetCast: SendGetCast;
  renderCast?: RenderCast;
};

export function createContentLifecycle({
  sendGetCast,
  renderCast = renderCastBlock,
}: ContentLifecycleDependencies): (input: LifecycleInput) => Promise<void> {
  const attemptedDocuments = new WeakSet<Document>();

  return async ({ document, pageUrl }: LifecycleInput): Promise<void> => {
    if (
      attemptedDocuments.has(document) ||
      document.querySelector(`[${LETTERCAST_CAST_MARKER}]`) !== null
    ) {
      return;
    }

    let page;
    try {
      page = detectLetterboxdMoviePage(document, pageUrl);
    } catch {
      return;
    }

    if (page === null) {
      return;
    }

    attemptedDocuments.add(document);

    try {
      const response = await sendGetCast({
        type: "get-cast",
        tmdbId: page.tmdbId,
      });

      if (!response.ok || response.cast.length === 0) {
        return;
      }

      renderCast({
        document,
        castContainer: page.castContainer,
        cast: response.cast,
      });
    } catch {
      document.querySelector(`[${LETTERCAST_CAST_MARKER}]`)?.remove();
    }
  };
}
