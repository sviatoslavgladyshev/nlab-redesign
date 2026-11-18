// Legacy starter text, retained only to recognize untouched drafts.
const TEMPLATES = {
  concept: { label: 'A concept', icon: 'sigma', note: 'Idea, definition, properties, examples', make: (n) => `## Idea

What is ${n}, and why does it matter? Explain it in a few sentences, linking to related pages like [[category theory]].

## Definition

+-- {: .num_defn #Definition}
###### Definition

A **${n}** is …

=--

## Properties

## Examples

## Related concepts

* [[ ]]

## References

` },
  result: { label: 'A theorem or result', icon: 'radical', note: 'Statement, proof, consequences', make: (n) => `## Statement

+-- {: .num_theorem #Statement}
###### Theorem

…

=--

+-- {: .proof}
###### Proof

…

=--

## Consequences

## Related results

* [[ ]]

## References

` },
  person: { label: 'A person', icon: 'users', note: 'Researcher, affiliation, selected writings', make: (n) => `* [personal page]( )

## Selected writings

* …

## Related entries

* [[ ]]

[[!redirects ${n}]]
` },
  blank: { label: 'Blank page', icon: 'file-text', note: 'Start from nothing', make: () => '## Idea\n\n' },
};

export function isUntouchedStarter(name, source) {
  const normalize = (text) => text.replace(/\s+/g, ' ').trim();
  const draft = normalize(source);
  return Object.values(TEMPLATES).some(({ make }) => normalize(make(name)) === draft);
}

export const PAGE_STARTERS = [
  { id: 'blank', title: 'Blank page', icon: 'plus', sections: [] },
  { id: 'concept', title: 'Concept', icon: 'sigma', sections: ['Idea', 'Definition', 'Examples', 'References'] },
  { id: 'result', title: 'Theorem or result', icon: 'radical', sections: ['Statement', 'Proof', 'Consequences', 'References'] },
  { id: 'person', title: 'Person', icon: 'user', sections: ['Overview', 'Selected writings', 'Related entries', 'References'] },
];

export function starterSource(id) {
  const starter = PAGE_STARTERS.find((option) => option.id === id);
  return starter?.sections.map((heading) => `## ${heading}\n\n`).join('') ?? '';
}
