/** On a phone the native header holds the search field: nothing to draw here. */
export function SearchField(_: {
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (text: string) => void;
}) {
  return <></>;
}
