// Starting points for a new page (chosen on the Write page).
export const TEMPLATES = {
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

export const newTemplate = (name, kind) => (TEMPLATES[kind] || TEMPLATES.concept).make(name);
