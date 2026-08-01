import type { Species } from "./types"

/**
 * Breed and species catalogues for pet registration.
 *
 * Free text produced "lab", "Labrador", "labrador retriever" and "Lab X" for
 * the same dog, which a manager cannot filter, count or write a bylaw against
 * — several buildings restrict by breed, and that only works if the value is
 * one of a known set.
 *
 * Every list ends in "Other", which reveals a free-text field. A closed list
 * would be wrong: there are hundreds of breeds and crosses, and an owner whose
 * dog is not on the list must still be able to register it truthfully.
 */

/** Shown when the owner picks the "Other" species tile. */
export const OTHER_SPECIES: { value: Species; label: string }[] = [
  { value: "bird", label: "Bird" },
  { value: "small_mammal", label: "Small mammal (rabbit, hamster, guinea pig…)" },
  { value: "fish", label: "Fish" },
  { value: "reptile", label: "Reptile" },
  { value: "other", label: "Something else" },
]

export const OTHER_BREED = "__other__"

/**
 * Common breeds by species, alphabetical.
 *
 * Not exhaustive by design — the goal is that the overwhelming majority of
 * registrations land on a known value, not that every breed is enumerable.
 * The dog list leans toward those a strata is most likely to have a rule
 * about, plus the most common companions.
 */
export const BREEDS_BY_SPECIES: Partial<Record<Species, string[]>> = {
  dog: [
    "Australian Shepherd",
    "Beagle",
    "Bernese Mountain Dog",
    "Border Collie",
    "Boxer",
    "Bulldog",
    "Cavalier King Charles Spaniel",
    "Chihuahua",
    "Cocker Spaniel",
    "Dachshund",
    "Doberman Pinscher",
    "French Bulldog",
    "German Shepherd",
    "Golden Retriever",
    "Great Dane",
    "Havanese",
    "Husky",
    "Jack Russell Terrier",
    "Labrador Retriever",
    "Maltese",
    "Mixed breed",
    "Pomeranian",
    "Poodle",
    "Pug",
    "Rottweiler",
    "Shih Tzu",
    "Staffordshire Bull Terrier",
    "Yorkshire Terrier",
  ],
  cat: [
    "Abyssinian",
    "American Shorthair",
    "Bengal",
    "Birman",
    "British Shorthair",
    "Domestic Longhair",
    "Domestic Shorthair",
    "Maine Coon",
    "Mixed breed",
    "Persian",
    "Ragdoll",
    "Russian Blue",
    "Scottish Fold",
    "Siamese",
    "Sphynx",
    "Tabby",
  ],
  bird: ["Budgerigar", "Canary", "Cockatiel", "Cockatoo", "Conure", "Finch", "Lovebird", "Macaw", "Parakeet", "Parrot"],
  small_mammal: ["Chinchilla", "Ferret", "Gerbil", "Guinea pig", "Hamster", "Hedgehog", "Rabbit", "Rat"],
  reptile: ["Bearded dragon", "Chameleon", "Corn snake", "Gecko", "Iguana", "Python", "Tortoise", "Turtle"],
  fish: ["Betta", "Cichlid", "Goldfish", "Guppy", "Koi", "Molly", "Tetra"],
}

/** Breeds for a species, or an empty list when we hold none for it. */
export function breedsFor(species: Species | null): string[] {
  if (!species) return []
  return BREEDS_BY_SPECIES[species] ?? []
}
