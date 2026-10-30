import type { GetCastRequest, GetCastResponse } from "@lettercast/contracts";

import { readNativeActorLinks } from "./actor-links";
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

type ReadActorLinks = typeof readNativeActorLinks;

type ContentLifecycleDependencies = {
  sendGetCast: SendGetCast;
  renderCast?: RenderCast;
  readActorLinks?: ReadActorLinks;
};

export function createContentLifecycle({
  sendGetCast,
  renderCast = renderCastBlock,
  readActorLinks = readNativeActorLinks,
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

      let nativeActorLinks: ReadonlyMap<string, string> = new Map();
      try {
        nativeActorLinks = readActorLinks(page.castContainer);
      } catch {
        nativeActorLinks = new Map();
      }

      renderCast({
        document,
        castContainer: page.castContainer,
        cast: response.cast,
        nativeActorLinks,
      });
    } catch {
      document.querySelector(`[${LETTERCAST_CAST_MARKER}]`)?.remove();
    }
  };
}
