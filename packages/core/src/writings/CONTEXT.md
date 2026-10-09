# Writings

The canonical language for identifying, reading, and searching published writings.

## Language

**Publication**:
A published work identified by its stable catalog identifier.
_Avoid_: Book, title record

**Publication Identifier**:
The stable catalog identity of one Publication.
_Avoid_: Book identifier, Publication Code

**Publication Code**:
The conventional short label used to cite a Publication. A Publication Code may identify more than one Publication and is not an identity.
_Avoid_: Publication identifier

**Paragraph**:
One content unit within a Publication, identified by its stable Paragraph Identifier.
_Avoid_: Row, block, item

**Paragraph Identifier**:
The stable catalog identity of one Paragraph within its Publication.
_Avoid_: Paragraph number, Publication Order

**Publication Order**:
A Paragraph's ordinal place within its Publication. It orders content but does not identify it.
_Avoid_: Paragraph identifier

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
The conventional display form of a Reference, such as `PP 351.1`, `PTUK February 4, 1897, page 70.2` or `11LtMs, Lt 1a, 1896, par. 14`. A refcode is a representation, not the identity itself. A refcode is matched as typed, with spacing and case ignored, and one refcode can cite paragraphs in more than one Publication.

**Refcode Match**:
One Paragraph a refcode cites, with its Publication. Looking up a refcode returns every match; a parent refcode (`PP 351`, `11LtMs, Lt 1a, 1896`) matches the Paragraphs under it.
_Avoid_: Search hit (a Search finds text; a lookup resolves a citation)

**Search**:
A text query across Paragraphs whose Reference is not known beforehand.
_Avoid_: Lookup

**Catalog**:
The available Publications and their metadata.
_Avoid_: Library (the application may contain more than one corpus)
