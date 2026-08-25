import { NextResponse } from 'next/server';
import {
  ApiError, assertSameOrigin, handleApiError, rateLimit, requireUser,
} from '../../../../server/api.js';
import { recipeImportSchema } from '../../../../server/schemas.js';
import { freeChat, freeVision, isOpenRouterConfigured } from '../../../../server/openrouter.js';
import {
  fetchSource, isFetchableRecipeUrl, materialIsUsable, readPageMetadata, sourceMaterial,
  sourcePlatform,
} from '../../../../server/recipe-source.js';
import {
  draftToRecipeText, extractionPrompt, parseRecipeDraft, RECIPE_SYSTEM,
} from '../../../../server/recipe-extract.js';
import { recipeTextFromMarkup } from '../../../../lib/recipe-markup.js';

/**
 * Recipe import: a link, a photo, or text already read off one.
 *
 * The order matters. A page that publishes schema.org Recipe data is read
 * directly — that is the recipe its author wrote, exactly, and no model
 * improves on it. Only when a page has no structured data (which is every
 * TikTok, Instagram and YouTube link) is what the page *did* say handed to a
 * model to lay out.
 *
 * Nothing is saved here. The route returns a draft; the user checks it and
 * decides whether it becomes a recipe. What comes back always says where it
 * came from and how it was read, so a caption-derived draft is never mistaken
 * for a published recipe.
 */

const ai = async ({ material, image }) => {
  if (!isOpenRouterConfigured()) throw new ApiError(503, 'Recipe extraction needs an AI provider configured.');
  try {
    const result = image
      ? await freeVision({
        system: RECIPE_SYSTEM,
        user: 'Read the recipe in this photo. Transcribe only what is written or shown.',
        image,
      })
      : await freeChat({ system: RECIPE_SYSTEM, user: extractionPrompt(material) });
    return result;
  } catch (error) {
    if (error?.message === 'no-vision-model') {
      throw new ApiError(503, 'No available model can read a photo right now. Type the recipe in instead.');
    }
    if (error?.message === 'no-free-model' || error?.status === 402) {
      throw new ApiError(503, 'No AI model is available right now. Paste the recipe text instead.');
    }
    if (error?.status === 429) throw new ApiError(429, 'The AI provider is rate limiting us. Try again shortly.');
    throw error;
  }
};

const draftResponse = (draft, source) => NextResponse.json({
  draft,
  // The plain-text form of the draft, so the browser matches ingredients and
  // works out nutrition with the same parser a pasted recipe goes through.
  text: draftToRecipeText(draft),
  source,
});

const fromUrl = async (url) => {
  if (!isFetchableRecipeUrl(url)) {
    throw new ApiError(400, 'That link cannot be fetched. Use a public http or https recipe link.');
  }
  const platform = sourcePlatform(url);
  const { html, oembed, errors } = await fetchSource(url);

  // Best case: the page publishes its own recipe data. Read it, don't model it.
  const structured = html ? recipeTextFromMarkup(html) : null;
  if (structured) {
    return NextResponse.json({
      draft: null,
      text: structured.text,
      source: {
        url,
        platform: platform?.id || 'web',
        platformLabel: platform?.label || '',
        via: 'link',
        read: 'schema.org',
        author: structured.provenance.author,
        datePublished: structured.provenance.datePublished,
        model: null,
        notes: 'Read from the page’s own recipe data.',
      },
    });
  }

  const metadata = readPageMetadata(html);
  const material = sourceMaterial({ url, metadata, oembed });
  if (!materialIsUsable(material)) {
    throw new ApiError(
      422,
      errors.length
        ? `That link gave us almost nothing to read (${errors.join(', ')}). Paste the recipe text instead.`
        : 'That link has no recipe text on it — only a title. Paste the recipe or its caption instead.',
    );
  }

  const { text, model } = await ai({ material });
  const draft = parseRecipeDraft(text);
  if (!draft) {
    throw new ApiError(422, 'There was no recipe in that page’s text. Paste the recipe or its caption instead.');
  }
  return draftResponse(draft, {
    url,
    platform: platform?.id || 'web',
    platformLabel: platform?.label || '',
    via: 'link',
    read: oembed?.caption ? 'caption' : 'page-metadata',
    author: oembed?.author || metadata.author || null,
    datePublished: metadata.published || null,
    model,
    notes: oembed?.caption
      ? 'Extracted from the video caption — check the amounts against the video.'
      : 'Extracted from the page description — check the amounts against the original.',
  });
};

const fromText = async (text, via) => {
  // Text lifted off a photo is often already a recipe; try reading it as one
  // before spending a model call on it.
  const material = sourceMaterial({ url: '', metadata: {}, pageText: text });
  const { text: output, model } = await ai({ material });
  const draft = parseRecipeDraft(output);
  if (!draft) throw new ApiError(422, 'No recipe could be read from that. Check the text and try again.');
  return draftResponse(draft, {
    url: null,
    platform: 'photo',
    platformLabel: 'Photo',
    via,
    read: 'ocr',
    author: null,
    datePublished: null,
    model,
    notes: 'Read from a photo on your device — check every amount before saving.',
  });
};

const fromImage = async (image) => {
  const { text, model } = await ai({ image });
  const draft = parseRecipeDraft(text);
  if (!draft) throw new ApiError(422, 'No recipe could be read in that photo. Try a flatter, brighter picture.');
  return draftResponse(draft, {
    url: null,
    platform: 'photo',
    platformLabel: 'Photo',
    via: 'photo',
    read: 'vision',
    author: null,
    datePublished: null,
    model,
    notes: 'Read from your photo by a vision model — check every amount before saving.',
  });
};

export async function POST(request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    // Each import is one page fetch and at most one model call, so the guard is
    // tighter than the general AI limit.
    await rateLimit(`recipe-import:${user.id}`, 60, 3600000);
    const input = recipeImportSchema.parse(await request.json());

    if (input.url) return await fromUrl(input.url);
    if (input.text) return await fromText(input.text, 'photo');
    return await fromImage(input.image);
  } catch (error) {
    return handleApiError(error);
  }
}
