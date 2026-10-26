/**
 * Copy for the marketing homepage and the journal, carried over from the
 * Pet10x-Redesign handoff (images live in public/landing). Kept out of the page so the journal
 * routes and the homepage cards read the same articles.
 */

/** Shop concepts. Illustrative only: there is no catalogue, stock or checkout. */
export const SHOP_CONCEPTS = [
  { id: "everyday-harness", name: "The everyday harness", category: "Walk", colour: "Terracotta", image: "/landing/harness.webp" },
  { id: "rope-lead", name: "The neighbourhood lead", category: "Walk", colour: "Forest", image: "/landing/lead.webp" },
  { id: "ceramic-bowl", name: "The everyday bowl", category: "Eat", colour: "Clay", image: "/landing/bowl.webp" },
  { id: "enrichment-toy", name: "A little more play", category: "Play", colour: "Orange", image: "/landing/toy.webp" },
]

export type Article = {
  slug: string
  category: string
  title: string
  summary: string
  image: string
  /** Portrait art (the cat) sits contained on a warm ground rather than cropped. */
  contain?: boolean
  read: string
  sections: [heading: string, body: string][]
}

export const ARTICLES: Article[] = [
  {
    slug: "a-place-for-the-little-things",
    category: "Everyday care",
    title: "A place for all the little things.",
    summary: "A simpler way to organise the everyday details of life with your pet.",
    image: "/landing/cat.webp",
    contain: true,
    read: "3 min read",
    sections: [
      ["Start with one home for the essentials", "A pet’s life comes with a surprising amount of information: a favourite routine, a vaccination record, an emergency contact, and the details that make them them. Keep those everyday essentials together so the next person helping with care knows where to look."],
      ["Make the routine visible", "Write down the practical things you want to keep track of, such as meals, walks, or an existing care schedule. A shared checklist helps a household see what has already been done. Always follow your veterinary team’s instructions for health-related care."],
      ["Keep records easy to find", "Save a clear copy of each document and name it in a way you will recognise later. Record the date shown on the document and set a reminder for any renewal. Keep your original documents as well."],
      ["Give it a regular refresh", "When something changes, update the information in the same place. A new contact number or a changed routine is much easier to remember when it is part of a small, repeatable habit."],
    ],
  },
  {
    slug: "a-more-pet-friendly-building",
    category: "Neighbourhood life",
    title: "Good neighbours. Great pet people.",
    summary: "Small habits that help people and pets share a happier building.",
    image: "/landing/community.webp",
    read: "4 min read",
    sections: [
      ["Begin with a conversation", "Living with pets in a shared building is about people as much as animals. Introduce yourself, learn the common spaces, and make it easy for a neighbour to reach you when something needs your attention."],
      ["Know where to find building information", "Keep the building’s current pet information and management contact in a place you can access. Ask your building manager if you are unsure how registration or shared-space arrangements work."],
      ["Make shared spaces a shared responsibility", "Pay attention to the people around you in corridors, lifts, and entrances. Give others room, clean up after your pet, and ask before approaching another person or animal."],
      ["Connect beyond the corridor", "A community feed can be a place for a walking group, a helpful local recommendation, or a lost-and-found notice. Keep personal details private and meet new neighbours thoughtfully."],
    ],
  },
  {
    slug: "shopping-a-little-closer-to-home",
    category: "The local edit",
    title: "A little closer to home.",
    summary: "Why neighbourhood discovery belongs in the future of Pet10x.",
    image: "/landing/shop.webp",
    read: "2 min read",
    sections: [
      ["The idea behind the local edit", "Pet10x already brings pet care and community together. The next opportunity is helping pet owners discover useful everyday products from businesses around them."],
      ["Start with the neighbourhood", "The proposed shop starts with a location, then shows a relevant assortment. Availability, collection options, and delivery details would need to come from participating businesses."],
      ["Useful, considered choices", "The preview explores walking essentials, mealtime basics, and things that make play more interesting. The products shown are illustrative; the final range will depend on our future partners."],
      ["Help shape what comes next", "The marketplace is a future phase. If you run a pet business and would like to talk about the idea, get in touch through business access. There are no live purchases on Pet10x yet."],
    ],
  },
]

export const FAQS: [question: string, answer: string][] = [
  ["What is Pet10x?", "Pet10x brings pet profiles, daily care, records, and building community into one app — with dedicated tools for building managers, local businesses and vet clinics."],
  ["Is it free?", "Pet Basic is free for every pet owner today. Paid plans are coming; if your building participates, it can sponsor premium features for approved residents."],
  ["How do I connect my pet to my building?", "Your building provides a registration code. Enter it in the app to connect your pet profile, then follow the building’s registration process. Contact your building manager if you do not have a code."],
  ["Can I report an incident without an account?", "Yes. Anyone can report an issue from the Report incident button, by scanning the building’s QR code or entering its building code. Photos can be attached as evidence."],
  ["Can I buy products on Pet10x yet?", "Not yet. The local shop is a preview of a future marketplace. The products shown are examples, and no orders or payments are taken."],
]
