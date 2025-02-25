const sinon = require('sinon');

const carddb = require('../../serverjs/cards');
const cubefn = require('../../serverjs/cubefn');

const cubefixture = require('../../fixtures/examplecube');

const Cube = require('../../models/cube');

const { arraysEqual } = require('../../src/utils/Util.js');

const fixturesPath = 'fixtures';

beforeEach(() => {
  sinon.stub(Cube, 'findOne');
});

afterEach(() => {
  Cube.findOne.restore();
  carddb.unloadCardDb();
});

test('getCubeId returns shortID when defined', () => {
  const testCube = {
    shortID: 'bbb',
    _id: 'c',
  };
  const result = cubefn.getCubeId(testCube);
  expect(result).toBe(testCube.shortID);
});

test('getCubeId returns _id when other ID fields are not present', () => {
  const testCube = {
    _id: 'c',
  };
  const result = cubefn.getCubeId(testCube);
  expect(result).toBe(testCube._id);
});

test('buildIdQuery returns a simple query when passed a 24-character alphanumeric string', () => {
  const testId = 'a1a1a1a1a1a1a1a1a1a1a1a1';
  const result = cubefn.buildIdQuery(testId);
  expect(result._id).toBe(testId);
});

test('buildIdQuery returns a shortID query when passed a non-alphanumeric string', () => {
  const testId = 'a1a-a1a1a1a1a1a1a1a1a1a1';
  const result = cubefn.buildIdQuery(testId);
  expect(result.shortID).toBe(testId);
});

test('cardsAreEquivalent returns true for two equivalent cards', () => {
  const testCard1 = {
    cardID: 'abcdef',
    status: 'Owned',
    cmc: 1,
    type_line: 'Creature - Hound',
    tags: ['New'],
    colors: ['W'],
    randomField: 'y',
    finish: 'Foil',
  };
  const testCard2 = JSON.parse(JSON.stringify(testCard1));
  const result = cubefn.cardsAreEquivalent(testCard1, testCard2);
  expect(result).toBe(true);
});

test('cardsAreEquivalent returns false for two nonequivalent cards', () => {
  const testCard1 = {
    cardID: 'abcdef',
    status: 'Owned',
    cmc: 1,
    type_line: 'Creature - Hound',
    tags: ['New'],
    colors: ['W'],
    randomField: 'y',
  };
  const testCard2 = JSON.parse(JSON.stringify(testCard1));
  testCard2.cmc = 2;
  const result = cubefn.cardsAreEquivalent(testCard1, testCard2);
  expect(result).toBe(false);
});

test('intToLegality returns the expected values', () => {
  expect(cubefn.intToLegality(0)).toBe('Vintage');
  expect(cubefn.intToLegality(1)).toBe('Legacy');
  expect(cubefn.intToLegality(2)).toBe('Modern');
  expect(cubefn.intToLegality(3)).toBe('Pioneer');
  expect(cubefn.intToLegality(4)).toBe('Standard');
  expect(cubefn.intToLegality(5)).toBe(undefined);
});

test('legalityToInt returns the expected values', () => {
  expect(cubefn.legalityToInt('Vintage')).toBe(0);
  expect(cubefn.legalityToInt('Legacy')).toBe(1);
  expect(cubefn.legalityToInt('Modern')).toBe(2);
  expect(cubefn.legalityToInt('Pioneer')).toBe(3);
  expect(cubefn.legalityToInt('Standard')).toBe(4);
  expect(cubefn.legalityToInt('not a format')).toBe(undefined);
});

test('generateShortId returns a valid short ID', async () => {
  const queryMockPromise = new Promise((resolve) => {
    process.nextTick(() => {
      resolve(3);
    });
  });
  const queryMock = jest.fn();
  queryMock.mockReturnValue(queryMockPromise);
  const initialCubeFind = Cube.find;
  Cube.estimatedDocumentCount = queryMock;

  const queryMockPromise2 = new Promise((resolve) => {
    process.nextTick(() => {
      resolve(false);
    });
  });
  const queryMock2 = jest.fn();
  queryMock2.mockReturnValue(queryMockPromise2);
  const initialExists = Cube.find;
  Cube.exists = queryMock2;

  const result = await cubefn.generateShortId();
  // result is a base36 number
  expect(result).toMatch(/[0-9a-z]+/g);

  Cube.find = initialCubeFind;
  Cube.exists = initialExists;
});

test('setCubeType correctly sets the type of its input cube', () => {
  expect.assertions(2);
  const exampleCube = JSON.parse(JSON.stringify(cubefixture.exampleCube));
  const promise = carddb.initializeCardDb(fixturesPath, true);
  return promise.then(() => {
    const result = cubefn.setCubeType(exampleCube, carddb);
    expect(result.type).toBe('Pioneer');
    expect(exampleCube.type).toBe('Pioneer');
  });
});

test('sanitize allows the correct tags', () => {
  const exampleHtml =
    '<html><head></head><body><div>lkgdfsge</div><strong>kjggggsgggg</strong><ol><li>gfgwwerer</li></ol></body></html>';
  const expected = '<div>lkgdfsge</div><strong>kjggggsgggg</strong><ol><li>gfgwwerer</li></ol>';
  const result = cubefn.sanitize(exampleHtml);
  expect(result).toBe(expected);
});

describe('CSVtoCards', () => {
  it('can find a card', async () => {
    const expectedId = 'aaae15dd-11b6-4421-99e9-365c7fe4a5d6';
    const expectedCard = {
      name: 'Embercleave',
      cmc: '3',
      type_line: 'Creature - Test',
      colors: ['U'],
      set: 'ELD',
      collector_number: '359',
      status: 'Owned',
      finish: 'Is Foil',
      imgUrl: 'http://example.com/',
      tags: ['tag1', 'tag2'],
    };
    const expectedMaybe = {
      name: 'Embercleave',
      cmc: '2',
      type_line: 'Creature - Type',
      colors: ['R', 'W'],
      set: 'ELD',
      collector_number: '120',
      status: 'Not Owned',
      finish: 'Is Not Foil',
      imgUrl: null,
      tags: ['tag3', 'tag4'],
    };
    const cards = [
      'Name,CMC,Type,Color,Set,Collector Number,Status,Finish,Maybeboard,Image URL,Tags',
      `"${expectedCard.name}",${expectedCard.cmc},${expectedCard.type_line.replace(
        '—',
        '-',
      )},${expectedCard.colors.join('')},${expectedCard.set},${expectedCard.collector_number},${expectedCard.status},${
        expectedCard.finish
      },false,${expectedCard.imgUrl},"${expectedCard.tags.join(';')}"`,
      `"${expectedMaybe.name}",${expectedMaybe.cmc},${expectedMaybe.type_line.replace(
        '—',
        '-',
      )},${expectedMaybe.colors.join('')},${expectedMaybe.set},${expectedMaybe.collector_number},${
        expectedMaybe.status
      },${expectedMaybe.finish},true,undefined,"${expectedMaybe.tags.join(';')}"`,
    ];
    await carddb.initializeCardDb(fixturesPath, true);
    const { newCards, newMaybe, missing } = cubefn.CSVtoCards(cards.join('\n'), carddb);
    expect.extend({
      equalsArray: (received, expected) => ({
        message: () => `expected ${received} to equal array ${expected}`,
        pass: arraysEqual(received, expected),
      }),
    });
    const expectSame = (card, expected) => {
      expect(card.cardID).toBe(expectedId);
      expect(card.name).toBe(expected.name);
      expect(card.cmc).toBe(expected.cmc);
      expect(card.colors).equalsArray(expected.colors);
      expect(card.collector_number).toBe(expected.collector_number);
      expect(card.status).toBe(expected.status);
      expect(card.finish).toBe(expected.finish);
      expect(card.imgUrl).toBe(expected.imgUrl);
      expect(card.tags).equalsArray(expected.tags);
    };
    expect(newCards.length).toBe(1);
    expectSame(newCards[0], expectedCard);
    expect(newMaybe.length).toBe(1);
    expectSame(newMaybe[0], expectedMaybe);
    expect(missing).toEqual([]);
  });

  it('can handle imports without a Maybeboard column', async () => {
    const expectedId = 'aaae15dd-11b6-4421-99e9-365c7fe4a5d6';
    const expectedCards = [
      {
        name: 'Embercleave',
        cmc: '3',
        typeLine: 'Creature - Test',
        colors: ['U'],
        set: 'ELD',
        collectorNumber: '359',
        status: 'Owned',
        finish: 'Is Foil',
        imgUrl: 'http://example.com/',
        tags: ['tag1', 'tag2'],
      },
    ];

    const CSV_HEADER = 'Name,CMC,Type,Color,Set,Collector Number,Status,Finish,Image URL,Tags';

    const cards = expectedCards.reduce((acc, next) => {
      const { name, cmc, typeLine, colors, set, collectorNumber, status, finish, imgUrl, tags } = next;

      acc +=
        `\n` +
        `${name},${cmc},${typeLine.replace('—', '-')},` +
        `${colors.join('')},${set},${collectorNumber},` +
        `${status},${finish},${imgUrl},${tags.join(';')}`;

      return acc;
    }, CSV_HEADER);

    await carddb.initializeCardDb(fixturesPath, true);
    const { newCards, missing } = cubefn.CSVtoCards(cards, carddb);

    expect.extend({
      equalsArray: (received, expected) => ({
        message: () => `expected ${received} to equal array ${expected}`,
        pass: arraysEqual(received, expected),
      }),
    });
    const expectSame = (card, expected) => {
      expect(card.cardID).toBe(expectedId);
      expect(card.name).toBe(expected.name);
      expect(card.cmc).toBe(expected.cmc);
      expect(card.colors).equalsArray(expected.colors);
      expect(card.collectorNumber).toBe(expected.collector_number);
      expect(card.status).toBe(expected.status);
      expect(card.finish).toBe(expected.finish);
      expect(card.imgUrl).toBe(expected.imgUrl);
      expect(card.tags).equalsArray(expected.tags);
    };
    expect(newCards.length).toBe(1);
    expectSame(newCards[0], expectedCards[0]);
    expect(missing).toEqual([]);
  });
});

describe('compareCubes', () => {
  it('can calculate the diff between two cubes', async () => {
    await carddb.initializeCardDb(fixturesPath, true);
    const queryMockPromise = new Promise((resolve) => {
      process.nextTick(() => {
        resolve({});
      });
    });
    const queryMock = jest.fn();
    queryMock.mockReturnValue(queryMockPromise);
    const cardsA = [cubefixture.exampleCube.cards[0], cubefixture.exampleCube.cards[1]];
    const cardsB = [cubefixture.exampleCube.cards[1], cubefixture.exampleCube.cards[2]];
    for (const card of cardsA) {
      card.details = { ...carddb.cardFromId(card.cardID) };
    }
    for (const card of cardsB) {
      card.details = { ...carddb.cardFromId(card.cardID) };
    }
    const { inBoth, onlyA, onlyB, aNames, bNames, allCards } = await cubefn.compareCubes(cardsA, cardsB);
    expect(inBoth.length).toBe(1);
    expect(inBoth[0].cardID).toBe(cubefixture.exampleCube.cards[1].cardID);
    expect(onlyA.length).toBe(1);
    expect(onlyA[0].cardID).toBe(cubefixture.exampleCube.cards[0].cardID);
    expect(onlyB.length).toBe(1);
    expect(onlyB[0].cardID).toBe(cubefixture.exampleCube.cards[2].cardID);
    expect(aNames.length).toBe(1);
    expect(bNames.length).toBe(1);
    expect(allCards.length).toBe(3);
  });
});
