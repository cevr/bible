// Fixture for film/no-data-url: each line marked RED fires the rule, and
// nothing else does.
export const png = 'data:image/png;base64,iVBORw0KGgo='; // RED film/no-data-url
export const svg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"; // RED film/no-data-url
export const upper = 'DATA:IMAGE/WEBP;base64,UklGRg=='; // RED film/no-data-url
export const bare = 'data:,hello'; // RED film/no-data-url
export const typeless = 'data:;base64,AAAA'; // RED film/no-data-url
export const css = 'background: url(data:image/gif;base64,R0lGOD) no-repeat'; // RED film/no-data-url
export const joined = (type: string, body: string) => 'data:' + type + ';base64,' + body; // RED film/no-data-url
export const built = (type: string, body: string) => `data:${type};base64,${body}`; // RED film/no-data-url
export const octets = 'data:application/octet-stream;base64,/9j/4A=='; // RED film/no-data-url
export const Img = () => <img alt="" src="data:image/jpeg;base64,/9j/4A==" />; // RED film/no-data-url

// Prose, a scheme ending in data, a field named data, an http URL and a comment pass.
export const prose = 'the pages as data: where each is served';
export const meta = 'metadata:application/json';
export const field = { data: new Uint8Array(0) };
export const url = 'https://firsttheblade.com/og/home.jpg';
export const asked = (type: string) => `an image of type ${type}`;
// A comment may say data:image/png, since no comment is served.
