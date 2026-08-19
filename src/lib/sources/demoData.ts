export interface LinkedInConnectionRaw {
  name: string;
  headline: string;
  profileUrl: string;
  connectedOn?: string;
}

export interface GmailSignalRaw {
  name: string;
  linkedinUrl?: string;
  email: string;
  emailsSent: number;
  emailsReceived: number;
  lastInteraction: string;
}

export interface CalendarSignalRaw {
  name: string;
  linkedinUrl?: string;
  email: string;
  meetings: number;
  lastMeeting: string;
}

export interface ContactRaw {
  name: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
}

export const DEMO_LINKEDIN_CONNECTIONS: LinkedInConnectionRaw[] = [
  { name: "Bruno Carvalho", headline: "Senior Backend Engineer at Nubank", profileUrl: "https://linkedin.com/in/bruno-carvalho", connectedOn: "2023-04-12" },
  { name: "Carla Nogueira", headline: "Product Manager at iFood", profileUrl: "https://linkedin.com/in/carla-nogueira", connectedOn: "2022-11-02" },
  { name: "Diego Martins", headline: "Staff Software Engineer, Distributed Systems at Stone", profileUrl: "https://linkedin.com/in/diego-martins", connectedOn: "2021-06-19" },
  { name: "Elisa Ramos", headline: "Data Scientist at QuintoAndar", profileUrl: "https://linkedin.com/in/elisa-ramos", connectedOn: "2024-01-30" },
  { name: "Felipe Souza", headline: "Frontend Engineer (React) at Mercado Livre", profileUrl: "https://linkedin.com/in/felipe-souza", connectedOn: "2023-08-08" },
  { name: "Gabriela Lima", headline: "Engineering Manager at Nubank", profileUrl: "https://linkedin.com/in/gabriela-lima", connectedOn: "2020-03-15" },
  { name: "Hugo Pereira", headline: "DevOps Engineer at Loft", profileUrl: "https://linkedin.com/in/hugo-pereira", connectedOn: "2022-05-21" },
  { name: "Isabela Duarte", headline: "Backend Engineer, Python, Fintech at PagSeguro", profileUrl: "https://linkedin.com/in/isabela-duarte", connectedOn: "2023-02-14" },
  { name: "Joao Vitor Alves", headline: "Recruiter, Tech Talent at Gupy", profileUrl: "https://linkedin.com/in/joao-vitor-alves", connectedOn: "2021-09-09" },
  { name: "Karina Fontes", headline: "Senior Data Engineer at C6 Bank", profileUrl: "https://linkedin.com/in/karina-fontes", connectedOn: "2024-03-01" },
  { name: "Lucas Andrade", headline: "Backend Engineer at Nubank, ex-iFood", profileUrl: "https://linkedin.com/in/lucas-andrade", connectedOn: "2022-07-27" },
  { name: "Mariana Costa", headline: "UX Designer at Creditas", profileUrl: "https://linkedin.com/in/mariana-costa", connectedOn: "2023-10-11" },
  { name: "Nicolas Teixeira", headline: "Site Reliability Engineer at Nubank", profileUrl: "https://linkedin.com/in/nicolas-teixeira", connectedOn: "2021-12-05" },
  { name: "Olivia Barros", headline: "Head of People at Loft", profileUrl: "https://linkedin.com/in/olivia-barros", connectedOn: "2020-08-18" },
  { name: "Pedro Almeida", headline: "Backend Engineer, Java/Kotlin at Itau Unibanco", profileUrl: "https://linkedin.com/in/pedro-almeida", connectedOn: "2023-05-30" },
  { name: "Quenia Rocha", headline: "Growth Marketing at Rappi", profileUrl: "https://linkedin.com/in/quenia-rocha", connectedOn: "2022-02-08" },
  { name: "Rafael Nunes", headline: "Principal Engineer, Payments at Nubank", profileUrl: "https://linkedin.com/in/rafael-nunes", connectedOn: "2019-11-22" },
  { name: "Sofia Meireles", headline: "QA Engineer at Wildlife Studios", profileUrl: "https://linkedin.com/in/sofia-meireles", connectedOn: "2023-01-17" },
  { name: "Thiago Farias", headline: "Backend Engineer, Golang, Fintech at Neon", profileUrl: "https://linkedin.com/in/thiago-farias", connectedOn: "2022-09-14" },
  { name: "Vitoria Prado", headline: "Sales Executive at Salesforce", profileUrl: "https://linkedin.com/in/vitoria-prado", connectedOn: "2021-04-03" },
];

export const DEMO_GMAIL_SIGNALS: GmailSignalRaw[] = [
  { name: "Bruno Carvalho", linkedinUrl: "https://linkedin.com/in/bruno-carvalho", email: "bruno.carvalho@gmail.com", emailsSent: 14, emailsReceived: 18, lastInteraction: "2026-07-13" },
  { name: "Gabriela Lima", linkedinUrl: "https://linkedin.com/in/gabriela-lima", email: "gabriela.lima@gmail.com", emailsSent: 6, emailsReceived: 9, lastInteraction: "2026-05-02" },
  { name: "Lucas Andrade", linkedinUrl: "https://linkedin.com/in/lucas-andrade", email: "lucas.andrade@gmail.com", emailsSent: 22, emailsReceived: 25, lastInteraction: "2026-08-01" },
  { name: "Rafael Nunes", linkedinUrl: "https://linkedin.com/in/rafael-nunes", email: "rafael.nunes@gmail.com", emailsSent: 3, emailsReceived: 2, lastInteraction: "2025-12-20" },
];

export const DEMO_CALENDAR_SIGNALS: CalendarSignalRaw[] = [
  { name: "Bruno Carvalho", linkedinUrl: "https://linkedin.com/in/bruno-carvalho", email: "bruno.carvalho@gmail.com", meetings: 5, lastMeeting: "2026-07-20" },
  { name: "Lucas Andrade", linkedinUrl: "https://linkedin.com/in/lucas-andrade", email: "lucas.andrade@gmail.com", meetings: 8, lastMeeting: "2026-08-05" },
  { name: "Isabela Duarte", linkedinUrl: "https://linkedin.com/in/isabela-duarte", email: "isabela.duarte@gmail.com", meetings: 2, lastMeeting: "2026-03-11" },
];

export const DEMO_CONTACTS: ContactRaw[] = [
  { name: "Bruno Carvalho", email: "bruno.carvalho@gmail.com", phone: "+55 11 90000-0001", linkedinUrl: "https://linkedin.com/in/bruno-carvalho" },
  { name: "Karina Fontes", email: "karina.fontes@gmail.com", linkedinUrl: "https://linkedin.com/in/karina-fontes" },
];
