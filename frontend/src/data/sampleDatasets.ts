export interface SampleDataset {
  id: string;
  name: string;
  description: string;
  filename: string;
  rows: number;
  columns: number;
  predictors: number;
  identifiers: number;
  problem: 'Clasificación binaria' | 'Clasificación multiclase' | 'Regresión';
  target: string;
  targetDescription: string;
  version: string;
  source: string;
  sourceUrl: string;
  authors: string;
  license: string;
  licenseUrl: string;
  bytes: number;
  sha256: string;
  missingValueTokens?: readonly string[];
  suggestedExcludedPredictors?: readonly string[];
}
const ccBy = 'https://creativecommons.org/licenses/by/4.0/';
export const SAMPLE_DATASETS: readonly SampleDataset[] = [
 {
    id: 'titanic', name: 'Titanic', description: 'Pasajeros, supervivencia, categorías y valores ausentes. Versión completa titanic3.',
    filename: 'titanic.csv', rows: 1309, columns: 14, predictors: 13, identifiers: 0,
    problem: 'Clasificación binaria', target: 'survived', targetDescription: 'Supervivencia: 0 = no; 1 = sí.',
    version: 'OpenML 40945 · v1 · archivo 16826755', source: 'OpenML / Vanderbilt Biostatistics',
    sourceUrl: 'https://www.openml.org/d/40945', authors: 'Frank E. Harrell Jr. y Thomas Cason; fuentes históricas citadas en OpenML.',
    license: 'CC BY según condiciones OpenML; metadato original: «Public»', licenseUrl: 'https://www.openml.org/terms',
    bytes: 104320, sha256: '98919d5c63fefef712481a38acd0d154887c4d96280af2c834a921ea05d124ee',
    suggestedExcludedPredictors: ['boat', 'body'],
  },
  {
    id: 'iris', name: 'Iris', description: 'Medidas de sépalos y pétalos de tres especies de iris, expresadas en centímetros.',
    filename: 'iris.csv', rows: 150, columns: 5, predictors: 4, identifiers: 0,
    problem: 'Clasificación multiclase', target: 'species', targetDescription: 'Iris-setosa, Iris-versicolor o Iris-virginica.',
    version: 'UCI 53 · iris.data · snapshot 2026-10-27', source: 'UCI Machine Learning Repository',
    sourceUrl: 'https://doi.org/10.24432/C56C76', authors: 'R. A. Fisher (1936).', license: 'CC BY 4.0', licenseUrl: ccBy,
    bytes: 4620, sha256: 'b9c2c79bfac42185ece47e3c0ac4b646594eccc0cf279546dd336b626ec9e70c',
  },
  {
    id: 'california-housing', name: 'California Housing', description: 'Grupos censales de California de 1990. Ocho medidas y el valor mediano de vivienda.',
    filename: 'california-housing.csv', rows: 20640, columns: 9, predictors: 8, identifiers: 0,
    problem: 'Regresión', target: 'MedHouseVal', targetDescription: 'Valor mediano de vivienda en unidades de 100.000 USD.',
    version: 'Mendeley hhb6nwfft8 · v1 · 2026-09-03', source: 'Mendeley Data / scikit-learn / StatLib',
    sourceUrl: 'https://doi.org/10.17632/hhb6nwfft8.1', authors: 'Vrushali Deshpande (exportación, 2026); R. Kelley Pace y Ronald Barry (1997).',
    license: 'CC BY 4.0 según el depósito v1', licenseUrl: ccBy,
    bytes: 1895154, sha256: '94ef369b909f5c725340b512b7c9a05c1550a554b6592d29303990e3ba521a1f',
  },
  {
    id: 'wine', name: 'Wine', description: 'Análisis químico de vinos italianos procedentes de tres cultivares. No es Wine Quality.',
    filename: 'wine.csv', rows: 178, columns: 14, predictors: 13, identifiers: 0,
    problem: 'Clasificación multiclase', target: 'cultivar_type', targetDescription: 'Tipo de cultivar original: 1, 2 o 3 (categorías sin orden).',
    version: 'UCI 109 · wine.data · snapshot 2026-10-27', source: 'UCI Machine Learning Repository',
    sourceUrl: 'https://doi.org/10.24432/C5PC7J', authors: 'Stefan Aeberhard y M. Forina (1992).', license: 'CC BY 4.0', licenseUrl: ccBy,
    bytes: 10949, sha256: '7c7cc9088c05defbb0de77c923ba7e1a16b22acb5c9c73652bb04217751a976d',
  },
  {
    id: 'breast-cancer', name: 'Breast Cancer Wisconsin Diagnostic', description: 'Treinta medidas de núcleos celulares, identificador y diagnóstico. Versión WDBC.',
    filename: 'breast-cancer-wisconsin-diagnostic.csv', rows: 569, columns: 32, predictors: 30, identifiers: 1,
    problem: 'Clasificación binaria', target: 'diagnosis', targetDescription: 'Diagnóstico original: M = maligno; B = benigno.',
    version: 'UCI 17 · wdbc.data · snapshot 2026-10-27', source: 'UCI Machine Learning Repository',
    sourceUrl: 'https://doi.org/10.24432/C5DW2B', authors: 'William H. Wolberg, W. Nick Street y Olvi L. Mangasarian; cita UCI: Wolberg et al. (1993).',
    license: 'CC BY 4.0', licenseUrl: ccBy,
    bytes: 124571, sha256: '1beebcb6fe65e01dc93a1aafd43bee201723dc5bbd2479e5f7ed8c634e788202',
  },
  {
    id: 'palmer-penguins', name: 'Palmer Penguins', description: 'Medidas de pingüinos de tres especies del archipiélago Palmer, con ausencias originales.',
    filename: 'penguins.csv', rows: 344, columns: 8, predictors: 7, identifiers: 0,
    problem: 'Clasificación multiclase', target: 'species', targetDescription: 'Especie: Adelie, Chinstrap o Gentoo.',
    version: 'palmerpenguins · penguins.csv · snapshot 2026-10-27', source: 'Repositorio oficial palmerpenguins / Palmer Station LTER',
    sourceUrl: 'https://raw.githubusercontent.com/allisonhorst/palmerpenguins/main/inst/extdata/penguins.csv',
    authors: 'Kristen B. Gorman y Palmer Station LTER; paquete: Allison M. Horst, Alison P. Hill y Kristen B. Gorman (2020).',
    license: 'CC0 1.0 (datos)', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    bytes: 15241, sha256: 'f204db2c753b0937caac3cb35258562c14f073e4bbc76be24b4c51ce22767a93',
    missingValueTokens: ['NA'],
  },
 ];

export function sampleDatasetUrl(sample: SampleDataset, baseUrl: string): string {
  return `${baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`}datasets/${sample.filename}`;
}
