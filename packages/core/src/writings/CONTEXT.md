# Writings

The canonical language for identifying, reading, and searching published writings.

## Language

**Publication**:
A published work identified by its stable code and catalog identifier.
_Avoid_: Book, title record

**Paragraph**:
One ordered content unit within a Publication. Its publication order is its stable local identity.
_Avoid_: Row, block, item

**Page**:
A non-empty sequence of Paragraphs sharing a printed page number, with finite adjacent-page navigation.
_Avoid_: Response, result set

**Heading**:
A titled structural marker in a Publication's table of contents.
_Avoid_: Chapter row, heading paragraph

**Reference**:
A typed location in the Writings: a Publication, Page, or Paragraph.
_Avoid_: Refcode string, position, address

**Refcode**:
The conventional display form of a Reference, such as `PP 351.1`. A refcode is a representation, not the identity itself.

**Search**:
A text query across Paragraphs whose Reference is not known beforehand.
_Avoid_: Lookup

**Catalog**:
The available Publications and their metadata.
_Avoid_: Library (the application may contain more than one corpus)
