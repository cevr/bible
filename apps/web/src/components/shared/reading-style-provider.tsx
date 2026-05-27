import { useEffect } from 'react';
import { usePreferences } from '@/providers/state-provider';
import { fontFamilyValue } from '@/data/fonts';

export function ReadingStyleProvider() {
  const { preferences } = usePreferences();

  useEffect(() => {
    const style = document.documentElement.style;
    style.setProperty('--reading-font-family', fontFamilyValue(preferences.fontFamily));
    style.setProperty('--reading-font-size', `${preferences.fontSize}px`);
    style.setProperty('--reading-line-height', String(preferences.lineHeight));
    style.setProperty('--reading-letter-spacing', `${preferences.letterSpacing}em`);
  }, [
    preferences.fontFamily,
    preferences.fontSize,
    preferences.lineHeight,
    preferences.letterSpacing,
  ]);

  return null;
}
