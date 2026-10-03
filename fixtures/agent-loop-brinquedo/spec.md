Crie `src/estatistica.mjs` exportando `media(lista)`, `mediana(lista)` e `moda(lista)` (números), e `src/index.mjs` reexportando as três.

- `media([1,2,3])` é 2; `media([])` é 0.
- `mediana([3,1,2])` é 2; `mediana([1,2,3,4])` é 2.5; `mediana([])` é 0; a lista recebida não pode ser alterada.
- `moda([1,2,2,3])` é 2; no empate, o menor valor (`moda([3,1,3,1])` é 1); `moda([])` é `null`.
