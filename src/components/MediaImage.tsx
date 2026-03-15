import { useEffect, useState } from 'react';
import type { ImgHTMLAttributes, ReactNode } from 'react';
import { BACKEND_HTTP_ORIGIN } from '../lib/config';
import { resolveMediaUrl } from '../lib/utils';

interface MediaImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src?: string | null;
  fallback?: ReactNode;
}

export function MediaImage({ src, alt, fallback = null, onError, ...props }: MediaImageProps) {
  const resolvedSrc = resolveMediaUrl(src);
  const [displaySrc, setDisplaySrc] = useState<string | undefined>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);

    if (!resolvedSrc) {
      setDisplaySrc(undefined);
      return;
    }

    if (
      resolvedSrc.startsWith('blob:') ||
      resolvedSrc.startsWith('data:') ||
      !resolvedSrc.startsWith(BACKEND_HTTP_ORIGIN)
    ) {
      setDisplaySrc(resolvedSrc);
      return;
    }

    let disposed = false;
    let objectUrl: string | null = null;
    const controller = new AbortController();

    void fetch(resolvedSrc, {
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load media: ${response.status}`);
        }

        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!disposed) {
          setDisplaySrc(objectUrl);
        }
      })
      .catch(() => {
        if (!disposed) {
          setDisplaySrc(resolvedSrc);
        }
      });

    return () => {
      disposed = true;
      controller.abort();
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [resolvedSrc]);

  if (!displaySrc || failed) {
    return <>{fallback}</>;
  }

  return (
    <img
      {...props}
      src={displaySrc}
      alt={alt}
      onError={(event) => {
        setFailed(true);
        onError?.(event);
      }}
    />
  );
}
