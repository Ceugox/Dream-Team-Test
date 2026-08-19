import { createPerson, type Person } from "../domain/person";
import type { NetworkSource } from "./base";
import {
  DEMO_GMAIL_SIGNALS,
  DEMO_CALENDAR_SIGNALS,
  DEMO_CONTACTS,
} from "./demoData";

export class GmailSource implements NetworkSource {
  name = "gmail" as const;
  async *discoverPeople(): AsyncGenerator<Person> {
    for (const signal of DEMO_GMAIL_SIGNALS) {
      yield createPerson({
        id: `gmail:${signal.email}`,
        name: signal.name,
        linkedinUrl: signal.linkedinUrl ?? null,
        emails: [signal.email],
        sources: ["gmail"],
        relationship: {
          emailsSent: signal.emailsSent,
          emailsReceived: signal.emailsReceived,
          meetings: 0,
          firstInteraction: null,
          lastInteraction: `${signal.lastInteraction}T00:00:00Z`,
          reciprocity: null,
          frequency: null,
          recency: null,
          contactSignal: null,
        },
      });
    }
  }
}

export class CalendarSource implements NetworkSource {
  name = "calendar" as const;
  async *discoverPeople(): AsyncGenerator<Person> {
    for (const signal of DEMO_CALENDAR_SIGNALS) {
      yield createPerson({
        id: `calendar:${signal.email}`,
        name: signal.name,
        linkedinUrl: signal.linkedinUrl ?? null,
        emails: [signal.email],
        sources: ["calendar"],
        relationship: {
          emailsSent: 0,
          emailsReceived: 0,
          meetings: signal.meetings,
          firstInteraction: null,
          lastInteraction: `${signal.lastMeeting}T00:00:00Z`,
          reciprocity: null,
          frequency: null,
          recency: null,
          contactSignal: null,
        },
      });
    }
  }
}

export class ContactsSource implements NetworkSource {
  name = "contacts" as const;
  async *discoverPeople(): AsyncGenerator<Person> {
    for (const contact of DEMO_CONTACTS) {
      yield createPerson({
        id: `contacts:${contact.email ?? contact.name}`,
        name: contact.name,
        linkedinUrl: contact.linkedinUrl ?? null,
        emails: contact.email ? [contact.email] : [],
        phones: contact.phone ? [contact.phone] : [],
        sources: ["contacts"],
      });
    }
  }
}
