import { hymns } from '~/hymns/hymns';
import { HymnList } from '~/reader/HymnList';
import { hymnsOffset } from '~/reader/place';

export default function Hymns() {
  return <HymnList hymns={hymns} hrefOf={(n) => `/hymns/${n}`} offset={hymnsOffset} />;
}
