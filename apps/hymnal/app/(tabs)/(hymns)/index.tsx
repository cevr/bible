import { hymns } from '~/hymns/hymns';
import { HymnList } from '~/reader/HymnList';

export default function Hymns() {
  return <HymnList hymns={hymns} hrefOf={(n) => `/hymns/${n}`} />;
}
