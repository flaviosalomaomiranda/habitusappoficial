
export interface UF {
    id: number;
    sigla: string;
    nome: string;
}

export interface Municipio {
    id: number;
    nome: string;
}

const cache = new Map<string, any>();

export async function getStates(): Promise<UF[]> {
    const cacheKey = 'states';
    if (cache.has(cacheKey)) {
        return cache.get(cacheKey);
    }

    const response = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome');
    if (!response.ok) {
        throw new Error('Falha ao buscar estados');
    }
    const data: UF[] = await response.json();
    cache.set(cacheKey, data);
    return data;
}

export async function getCitiesByState(uf: string): Promise<Municipio[]> {
    if (!uf) return [];
    
    const cacheKey = `cities-${uf}`;
    if (cache.has(cacheKey)) {
        return cache.get(cacheKey);
    }
    
    const response = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`);
    if (!response.ok) {
        throw new Error('Falha ao buscar municípios');
    }
    const data: Municipio[] = await response.json();
    cache.set(cacheKey, data);
    return data;
}
