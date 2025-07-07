import { ServerBlockNoteEditor } from '@blocknote/server-util';
import { Client as DocSpecAPI } from '@docspec.io/api-client';
import { Request, Response } from 'express';
import * as Y from 'yjs';

import { DOCSPEC_API_BASE_URL } from '@/env';
import { logger } from '@/utils';

interface ErrorResponse {
  error: string;
}

const editor = ServerBlockNoteEditor.create();

function createDocSpecClient(): DocSpecAPI | null {
  if (DOCSPEC_API_BASE_URL) {
    return new DocSpecAPI(DOCSPEC_API_BASE_URL);
  }

  return null;
}

export const convertHandler = async (
  req: Request<object, Uint8Array | ErrorResponse, Buffer, object>,
  res: Response<Uint8Array | ErrorResponse>,
) => {
  if (!req.body || req.body.length === 0) {
    res.status(400).json({ error: 'Invalid request: missing content' });
    return;
  }

  const contentType = req.header('content-type') ?? 'text/markdown';

  try {
    type Blocks = Awaited<ReturnType<typeof editor.tryParseMarkdownToBlocks>>;
    let blocks: Blocks;

    const docSpec = createDocSpecClient();

    if (contentType === 'text/markdown') {
      blocks = await editor.tryParseMarkdownToBlocks(req.body.toString());
    } else if (docSpec) {
      const response = await docSpec.convert(req.body);
      // @TODO: Implement some schema validation here
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const { content } = (await response.json()) as { content: Blocks };
      blocks = content;
    } else {
      res.status(400).json({ error: 'Unsupported content-type' });
      return;
    }

    // Perform the conversion from markdown to Blocknote.js blocks

    if (!blocks || blocks.length === 0) {
      res.status(500).json({ error: 'No valid blocks were generated' });
      return;
    }

    // Create a Yjs Document from blocks
    const yDocument = editor.blocksToYDoc(blocks, 'document-store');

    res
      .status(200)
      .setHeader('content-type', 'application/octet-stream')
      .send(Y.encodeStateAsUpdate(yDocument));
  } catch (e) {
    logger('conversion failed:', e);
    res.status(500).json({ error: 'An error occurred' });
  }
};
