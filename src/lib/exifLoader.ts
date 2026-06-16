import {createServerFn} from '@tanstack/react-start'
import {readExifForAsset, type ExifResult} from './server/exifReader'

export type {ExifResult}

// `readExifForAsset` is only referenced inside the handler, so the compiler
// strips the server-only import from the client bundle (replaced by an RPC stub).
export const loadExif = createServerFn({method: 'GET'})
  .inputValidator((data: {assetId: string}) => data)
  .handler(({data}): Promise<ExifResult> => readExifForAsset(data.assetId))
