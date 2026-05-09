import type { ContentTypeConfig } from './types';
import {
  AnalyzeFrontmatter,
  MessageFrontmatter,
  StudyFrontmatter,
  ReadingFrontmatter,
  SabbathSchoolFrontmatter,
} from './schemas';

export const AnalyzeConfig: ContentTypeConfig<typeof AnalyzeFrontmatter> = {
  name: 'analyze',
  displayName: 'Analysis',
  outputDir: 'analyze',
  notesFolder: 'analysis',
  frontmatterSchema: AnalyzeFrontmatter,
  sortStrategy: { _tag: 'date-desc' },
};

export const MessagesConfig: ContentTypeConfig<typeof MessageFrontmatter> = {
  name: 'messages',
  displayName: 'Message',
  outputDir: 'messages',
  notesFolder: 'messages',
  frontmatterSchema: MessageFrontmatter,
  sortStrategy: { _tag: 'date-desc' },
};

export const StudiesConfig: ContentTypeConfig<typeof StudyFrontmatter> = {
  name: 'studies',
  displayName: 'Study',
  outputDir: 'studies',
  notesFolder: 'studies',
  frontmatterSchema: StudyFrontmatter,
  sortStrategy: { _tag: 'date-desc' },
};

export const ReadingsConfig: ContentTypeConfig<typeof ReadingFrontmatter> = {
  name: 'readings',
  displayName: 'Reading',
  outputDir: 'readings',
  notesFolder: 'readings',
  frontmatterSchema: ReadingFrontmatter,
  sortStrategy: { _tag: 'chapter-asc' },
};

export const SabbathSchoolConfig: ContentTypeConfig<typeof SabbathSchoolFrontmatter> = {
  name: 'sabbath-school',
  displayName: 'Sabbath School',
  outputDir: 'sabbath-school',
  notesFolder: 'sabbath school',
  frontmatterSchema: SabbathSchoolFrontmatter,
  sortStrategy: { _tag: 'year-quarter-week' },
};
