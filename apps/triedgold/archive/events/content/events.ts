/**
 * The events page's listings, carried over unchanged from the old site
 * (cevr/tried-gold). They were written there as sample data ("in a real
 * application, this would come from a database or CMS"): the dates are in
 * 2025, the first location is "Anytown", and each Register link points at an
 * anchor that does not exist. They stay as they were until the ministry
 * supplies real events.
 *
 * Archived with its route (`../routes/events.tsx`) outside the build: the
 * owner hid the page, and `/events` answers 404. To bring it back, move both
 * files back under `app/` and re-add the route in `app/routes.ts`.
 */

export interface UpcomingEvent {
  readonly id: string;
  readonly title: string;
  readonly date: string;
  readonly time: string;
  readonly location: string;
  readonly description: string;
  readonly registrationLink: string;
}

export interface PastEvent {
  readonly id: string;
  readonly title: string;
  readonly date: string;
  readonly description: string;
}

export const upcomingEvents: ReadonlyArray<UpcomingEvent> = [
  {
    id: '1',
    title: 'The Three Angels Messages: Understanding End-Time Prophecy',
    date: 'June 15, 2025',
    time: '7:00 PM - 9:00 PM',
    location: 'Community Center, 123 Main St, Anytown',
    description:
      'Join us for an in-depth study of Revelation 14 and the Three Angels Messages. We will explore the historical context, current relevance, and practical application of these crucial end-time prophecies. This seminar will strengthen your understanding of our unique SDA message and mission.',
    registrationLink: '#register-1',
  },
  {
    id: '2',
    title: "Health and Temperance: God's Natural Remedies",
    date: 'Every Thursday starting June 20, 2025',
    time: '6:30 PM - 8:00 PM',
    location: 'Virtual Event (Zoom)',
    description:
      "This 8-week study will explore the health principles given to Ellen G. White and their biblical foundation. Topics include the eight natural remedies, plant-based nutrition, and practical steps for implementing God's health laws in your daily life. Perfect for those seeking to align their lifestyle with SDA health principles.",
    registrationLink: '#register-2',
  },
  {
    id: '3',
    title: 'Sabbath School Leadership Training',
    date: 'July 12, 2025',
    time: '9:00 AM - 2:00 PM',
    location: 'Church Fellowship Hall',
    description:
      'A comprehensive training session for Sabbath School teachers and leaders. Learn effective methods for teaching Bible lessons, engaging youth, and creating meaningful Sabbath School experiences that honor our SDA heritage and promote spiritual growth.',
    registrationLink: '#register-3',
  },
];

export const pastEvents: ReadonlyArray<PastEvent> = [
  {
    id: '4',
    title: 'The Great Controversy: Understanding the Conflict',
    date: 'May 8, 2025',
    description:
      'A deep dive into the great controversy theme and its relevance to our daily walk with Christ. This workshop explored the cosmic conflict between good and evil from an SDA perspective.',
  },
  {
    id: '5',
    title: 'Biblical Stewardship: Tithing and Offerings',
    date: 'April 22, 2025',
    description:
      "A practical seminar on biblical stewardship principles, focusing on the importance of tithing, systematic benevolence, and faithful management of God's resources according to SDA teachings.",
  },
  {
    id: '6',
    title: 'Pathfinder Club Annual Investiture',
    date: 'March 31, 2025',
    description:
      'A special ceremony celebrating the spiritual growth and achievements of our youth in the Pathfinder program, reinforcing our commitment to youth development and SDA values.',
  },
];
