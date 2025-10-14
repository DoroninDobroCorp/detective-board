import React, { useEffect, useMemo, useRef, useState } from 'react';
import { fetchFirstImageFromGoogle, fetchFirstImageFromOpenverse, fetchFirstImageFromQwant, fetchFirstImageFromWikipedia } from '../imageSearch';
import { getLogger } from '../logger';

const log = getLogger('SmartImage');

export interface SmartImageProps {
  urls: string[];
  alt: string;
  style?: React.CSSProperties;
  className?: string;
  onResolved?: (url: string, index: number) => void;
  query?: string;
}

export const SmartImage: React.FC<SmartImageProps> = ({ urls, alt, style, className, onResolved, query }) => {
  const [dynamicUrls, setDynamicUrls] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (!query || !query.trim()) {
        setDynamicUrls([]);
        return;
      }
      setDynamicUrls([]);
      const normalized = query.trim();
      const results: string[] = [];
      const push = (url?: string) => {
        if (!alive || !url) return;
        if (!results.includes(url)) results.push(url);
      };
      try {
        const ov = await fetchFirstImageFromOpenverse(normalized);
        push(ov);
      } catch (e) {
        if (alive) log.warn('openverse_fetch_failed', e as Error);
      }
      try {
        const wiki = await fetchFirstImageFromWikipedia(normalized);
        push(wiki);
      } catch (e) {
        if (alive) log.warn('wikipedia_fetch_failed', e as Error);
      }
      try {
        const google = await fetchFirstImageFromGoogle(normalized);
        push(google);
      } catch (e) {
        if (alive) log.warn('google_fetch_failed', e as Error);
      }
      try {
        const qwant = await fetchFirstImageFromQwant(normalized);
        push(qwant);
      } catch (e) {
        if (alive) log.warn('qwant_fetch_failed', e as Error);
      }
      if (!alive) return;
      setDynamicUrls(results);
    };
    void load();
    return () => {
      alive = false;
    };
  }, [query]);

  const list = useMemo(() => {
    const merged = [...dynamicUrls, ...urls].filter(Boolean);
    return merged.filter((url, idx) => merged.indexOf(url) === idx);
  }, [dynamicUrls, urls]);
  const [idx, setIdx] = useState(0);
  const reportedRef = useRef<string | null>(null);

  useEffect(() => {
    // reset index when urls change
    setIdx(0);
    reportedRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.join('|')]);

  const src = list[idx] || '';

  return (
    <img
      src={src}
      alt={alt}
      style={style}
      className={className}
      onLoad={(e) => {
        const current = (e.currentTarget as HTMLImageElement).src;
        if (reportedRef.current !== current) {
          reportedRef.current = current;
          onResolved?.(current, idx);
        }
      }}
      onError={() => {
        setIdx((i) => (i < list.length - 1 ? i + 1 : i));
      }}
    />
  );
};

export default SmartImage;
