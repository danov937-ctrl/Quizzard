# Round 3 review – математика и числови въпроси

Every answer was computed or fact-checked line by line.

## data/q/mat_mc.txt

- old: `1|mat|Колко единици има в числото 17?|7|1|17|10`
  new: `1|mat|Коя цифра стои на мястото на единиците в числото 17?|7|1|0|8`
  reason: ambiguous: 17 has 17 units in total, so option 17 was arguably correct

- old: `1|mat|Права линия, която има два края, се нарича…|отсечка|точка|крива линия|ъгъл`
  new: `1|mat|Права линия, ограничена от две точки, се нарича…|отсечка|точка|крива линия|ъгъл`
  reason: clearer, mathematically sound wording

- old: `1|mat|Ели имала 12 бонбона. Дала 5 на брат си. Колко ѝ останали?|7|6|8|17`
  new: `1|mat|Ели имала 12 бонбона. Дала 5 на брат си. Колко бонбона ѝ останали?|7|6|8|17`
  reason: wording: missing noun

- old: `1|mat|Кое е вярно за 3 + 4 и 4 + 3?|равни са|първото е по-голямо|второто е по-голямо|не може да се сравнят`
  new: `1|mat|Кое е вярно за 3 + 4 и 4 + 3?|равни са|първото е по-голямо|второто е по-голямо|не могат да се сравнят`
  reason: grammar: не могат

- old: `2|mat|Колко десетици има в числото 100?|10|100|1|0`
  new: `2|mat|Колко десетици има общо в числото 100?|10|100|1|0`
  reason: ambiguous: the tens digit of 100 is 0 (an option); added 'общо'

- old: `2|mat|Коя сума е равна на 3 · 4?|4 + 4 + 4|3 + 4|3 + 3 + 3|4 + 4 + 4 + 4`
  new: `2|mat|Коя сума е равна на 3 · 4?|3 + 3 + 3 + 3|3 + 4|3 + 3 + 3|4 + 4 + 4 + 4`
  reason: Bulgarian convention: 3 · 4 = 3 + 3 + 3 + 3 (the file's own 5 + 5 + 5 + 5 = 5 · 4 item uses it); the old key contradicted that

- old: `2|mat|Кое е най-дълго?|1 м|90 см|9 дм|99 см`
  new: `2|mat|Кое е най-дълго?|1 м|90 см|8 дм|99 см`
  reason: two wrong options were equal (90 см = 9 дм)

- old: `3|mat|Триъгълник с точно две равни страни се нарича…|равнобедрен|равностранен|разностранен|тъпоъгълен`
  new: `3|mat|Триъгълник с точно две равни страни се нарича…|равнобедрен|равностранен|разностранен|правоъгълник`
  reason: distractor 'тъпоъгълен' can also describe an isosceles triangle

- old: `3|mat|Триъгълник с три различни страни се нарича…|разностранен|равнобедрен|равностранен|правоъгълен`
  new: `3|mat|Триъгълник с три различни страни се нарича…|разностранен|равнобедрен|равностранен|правоъгълник`
  reason: distractor 'правоъгълен' can also have three different sides (3-4-5)

- old: `4|mat|Колко хиляди има в числото 45 000?|45|4|5|450`
  new: `4|mat|Колко хиляди има общо в числото 45 000?|45|4|5|450`
  reason: ambiguous: the thousands digit is 5 (an option); added 'общо'

- old: `4|mat|Закръглете числото 4 678 до стотици.|4 700|4 600|4 680|5 000`
  new: `4|mat|Закръгли числото 4 678 до стотици.|4 700|4 600|4 680|5 000`
  reason: address the child in the singular, as elsewhere

- old: `4|mat|Кое е по-тежко: 2 500 г или 2 кг и 50 г?|2 500 г|2 кг и 50 г|равни са|не може да се сравнят`
  new: `4|mat|Кое е по-тежко: 2 500 г или 2 кг и 50 г?|2 500 г|2 кг и 50 г|равни са|не могат да се сравнят`
  reason: grammar: не могат

## data/q/mat_num.txt

- old: `1|mat|В клас има 20 ученици. 7 от тях са болни. Колко ученици са в клас днес?|13`
  new: `1|mat|В класа има 20 ученици. 7 от тях са болни и са вкъщи. Колко ученици са в клас днес?|13`
  reason: make explicit that the sick pupils are absent

## data/questions_num.txt

- old: `4|obsht|През коя година е покръстването на българите?|864`
  new: `4|obsht|През кой век е покръстването на българите? Напиши числото.|9`
  reason: the year is disputed (864/865/866); the century (IX) is not

- old: `4|mat|Колко дни има високосната година?|366`
  new: deleted
  reason: duplicate of q/okol_num.txt '2|okol|Колко дни има една високосна година?|366'

- old: `4|mat|Колко сантиметра има в 2 метра?|200`
  new: `2|mat|Колко сантиметра има в 2 метра?|200`
  reason: m/cm conversion is grade-2 material; too easy for grade 4

## data/q/okol_num.txt

- old: `2|okol|Колко секунди има една минута?|60`
  new: deleted
  reason: duplicate of questions_num.txt '3|mat|Колко секунди има в 1 минута?'; seconds are grade-3 math, not grade-2 Околен свят

- old: `2|okol|През коя година е основана българската държава?|681`
  new: deleted
  reason: duplicate of questions_num.txt '4|obsht|…Дунавска България?|681' (Човекът и обществото, 4 клас, is the right place)

## Notes

- Grade-1 items that use numbers 21–100 (e.g. "следващо на 39", "най-голямото двуцифрено число") were kept: the current МОН програма for 1 клас goes up to 100 (adding and subtracting to 20, then to 100 without carrying).
- All other lines were checked and found correct, each with exactly one defensible answer.

## Counts

| file | non-comment lines checked | changed | deleted |
|---|---|---|---|
| q/mat_mc.txt | 320 | 12 | 0 |
| q/mat_num.txt | 60 | 1 | 0 |
| questions_num.txt | 34 | 2 | 1 |
| q/okol_num.txt | 20 | 0 | 2 |
