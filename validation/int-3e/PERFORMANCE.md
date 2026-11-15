# INT-3e — tangentes fechadas

O worker avalia a força e a tangente das cargas uniformes pelas
derivadas explícitas do centroide da linha cúbica deformada. O teste
compara o centroide, o jacobiano e a Hessiana com os jets da referência,
inclusive fora da vizinhança de rotação zero. O resultado completo do
pórtico com rótula e carga distribuída passa em 1e−10 absoluto e relativo
com essa substituição. A tangente da barra axial já era fechada.

Na primeira malha das 42 combinações, o tempo caiu de 11,58 s para
9,50 s, com 1,27 s no cálculo das cargas contra 3,26 s no perfil anterior.
O perfil registra os tempos individuais. A solicitação completa ainda
consome o prazo de 20 s, mantendo a recusa de transporte. A primeira
malha termina no teto artificial de uma subdivisão durante a medição,
sem gerar resultado de dimensionamento parcial.

U-N01 isolada foi aceita em 44,85 s pelo worker numérico em chamada
direta, incluindo todos os níveis. A avaliação dos pórticos consumiu
35,64 s. O tempo de aceitação do galpão completo permanece desconhecido
além do timeout observado.

O candidato de pórtico usa a Hessiana material BᵀDB e a parcela de
tensões ΣmᵢHᵢ, com cinemática corrotacional explícita e avaliação em
lote. O teste do elemento passa a 1e−10 e U-N01 isolada levou 12,57 s.
No pórtico completo com carga distribuída, dois componentes brutos de
equilíbrio diferiram em 4,66e−10 N e 4,66e−10 N·m. A carga leve do
pórtico iniciado na malha 4 voltou a recusar Newton. O candidato
permanece em validação. O worker preserva a avaliação original do
pórtico e das rótulas.

Com BLAS em uma thread:

    python validation/int-3e/check_frame_candidate.py
    python -I validation/int-3d/profile_shed.py --max-subdivisions 1 --output <arquivo>

O contador histórico `uniform_ad` do perfil mede a avaliação de carga,
que usa a forma fechada nesta revisão.
