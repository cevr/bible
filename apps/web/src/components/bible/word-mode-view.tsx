/**
 * Word mode view for Strong's concordance study.
 *
 * Displays verse text as individual words with Strong's number indicators.
 * Arrow keys navigate between words, Space/Enter opens Strong's popup.
 */
import type { VerseWord } from '@/data/study/service';

export interface WordModeViewProps {
  words: VerseWord[];
  selectedIndex: number;
  onSelectWord: (index: number) => void;
  onOpenStrongs: (strongsNumber: string) => void;
}

export function WordModeView({
  words,
  selectedIndex,
  onSelectWord,
  onOpenStrongs,
}: WordModeViewProps) {
  return (
    <span className="reading-text">
      {words.map((word, index) => {
        const isSelected = index === selectedIndex;
        const hasStrongs = word.strongsNumbers !== null && word.strongsNumbers.length > 0;

        return (
          <span key={index}>
            <span
              className={`cursor-pointer rounded px-0.5 transition-colors duration-75 ${
                isSelected
                  ? 'bg-primary/15 text-primary font-semibold underline underline-offset-2'
                  : hasStrongs
                    ? 'text-foreground'
                    : 'text-muted-foreground'
              }`}
              tabIndex={0}
              aria-selected={isSelected}
              aria-description={
                hasStrongs ? `Strong's: ${word.strongsNumbers?.join(', ')}` : undefined
              }
              onClick={() => {
                onSelectWord(index);
                const first = word.strongsNumbers?.[0];
                if (first) {
                  onOpenStrongs(first);
                }
              }}
            >
              {word.wordText}
            </span>
            {isSelected && hasStrongs && (
              <sup className="text-[0.6rem] font-mono text-muted-foreground ml-0.5">
                {word.strongsNumbers?.[0]}
              </sup>
            )}
            {index < words.length - 1 ? ' ' : ''}
          </span>
        );
      })}
    </span>
  );
}
