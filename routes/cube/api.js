require('dotenv').config();
const express = require('express');
// eslint-disable-next-line import/no-unresolved
const { body } = require('express-validator');
const fetch = require('node-fetch');
const { Canvas, Image } = require('canvas');

Canvas.Image = Image;

const cardutil = require('../../dist/utils/Card.js');
const carddb = require('../../serverjs/cards.js');
const { ensureAuth, jsonValidationErrors } = require('../middleware');
const util = require('../../serverjs/util.js');

const {
  fromEntries,
  generatePack,
  setCubeType,
  cardsAreEquivalent,
  buildIdQuery,
  buildTagColors,
  cubeCardTags,
  maybeCards,
  saveDraftAnalytics,
  addCardHtml,
  isCubeViewable,
} = require('../../serverjs/cubefn.js');
const { isInFeaturedQueue } = require('../../serverjs/featuredQueue');

const { rotateArrayLeft, createPool } = require('./helper');

// Bring in models
const Cube = require('../../models/cube');
const Draft = require('../../models/draft');
const GridDraft = require('../../models/gridDraft');
const CubeAnalytic = require('../../models/cubeAnalytic');
const Package = require('../../models/package');
const Blog = require('../../models/blog');

const router = express.Router();

// API routes
router.get('/cardnames', (_, res) => {
  return res.status(200).send({
    success: 'true',
    cardnames: carddb.cardtree,
  });
});

// Get the full card images including image_normal and image_flip
router.get('/cardimages', (_, res) => {
  return res.status(200).send({
    success: 'true',
    cardimages: carddb.cardimages,
  });
});

router.post(
  '/editoverview',
  ensureAuth,
  body('name', 'Cube name should be between 5 and 100 characters long.').isLength({
    min: 5,
    max: 100,
  }),
  body('name', 'Cube name may not use profanity.').custom((value) => !util.hasProfanity(value)),
  body('shortID', 'Custom URL must contain only alphanumeric characters, dashes, and underscores.').matches(
    /^[A-Za-z0-9_-]*$/,
  ),
  body('shortID', `Custom URL may not be empty or longer than 100 characters.`).isLength({
    min: 1,
    max: 100,
  }),
  body('shortID', 'Custom URL may not use profanity.').custom((value) => !util.hasProfanity(value)),
  jsonValidationErrors,
  util.wrapAsyncApi(async (req, res) => {
    const updatedCube = req.body;

    const cube = await Cube.findById(updatedCube._id);
    const { user } = req;

    if (!isCubeViewable(cube, user)) {
      return res.status(404).send({
        success: 'false',
        message: 'Cube Not Found',
      });
    }

    if (!user._id.equals(cube.owner)) {
      return res.status(403).send({
        success: 'false',
        message: 'Unauthorized',
      });
    }

    if (updatedCube.shortID !== cube.shortID) {
      updatedCube.shortID = updatedCube.shortID.toLowerCase();
      const taken = await Cube.findOne(buildIdQuery(updatedCube.shortID));

      if (taken) {
        return res.status(400).send({
          success: 'false',
          message: 'Custom URL already taken.',
        });
      }

      cube.shortID = updatedCube.shortID;
    }

    cube.name = updatedCube.name;
    cube.privatePrices = updatedCube.privatePrices;
    cube.overrideCategory = updatedCube.overrideCategory;

    const image = carddb.imagedict[updatedCube.image_name.toLowerCase()];

    if (image) {
      cube.image_uri = updatedCube.image_uri;
      cube.image_artist = updatedCube.image_artist;
      cube.image_name = updatedCube.image_name;
    }

    if (updatedCube.description) {
      cube.description = updatedCube.description;
    }
    cube.date_updated = Date.now();
    cube.updated_string = cube.date_updated.toLocaleString('en-US');

    // cube category override
    if (cube.overrideCategory) {
      const categories = ['Vintage', 'Legacy+', 'Legacy', 'Modern', 'Pioneer', 'Historic', 'Standard', 'Set'];
      const prefixes = [
        'Powered',
        'Unpowered',
        'Pauper',
        'Peasant',
        'Budget',
        'Silver-bordered',
        'Commander',
        'Battle Box',
        'Multiplayer',
        'Judge Tower',
      ];

      if (!categories.includes(updatedCube.categoryOverride)) {
        return res.status(400).send({
          success: 'false',
          message: 'Not a valid category override.',
        });
      }

      for (let i = 0; i < updatedCube.categoryPrefixes.length; i += 1) {
        if (!prefixes.includes(updatedCube.categoryPrefixes[i])) {
          return res.status(400).send({
            success: 'false',
            message: 'Not a valid category prefix.',
          });
        }
      }

      cube.categoryOverride = updatedCube.categoryOverride;
      cube.categoryPrefixes = updatedCube.categoryPrefixes;
    }

    // cube tags
    cube.tags = updatedCube.tags.filter((tag) => tag && tag.length > 0).map((tag) => tag.toLowerCase());
    setCubeType(cube, carddb);

    await cube.save();
    return res.status(200).send({
      success: 'true',
    });
  }),
);

router.post(
  '/settings/:id',
  ensureAuth,
  body('privatePrices').toBoolean(),
  body('disableNotifications').toBoolean(),
  body('defaultStatus', 'Status must be valid.').isIn(['Owned', 'Not Owned']),
  body('defaultPrinting', 'Printing must be valid.').isIn(['recent', 'first']),
  body('visibility', 'Visibility must be valid').isIn(['public', 'unlisted', 'private']),
  jsonValidationErrors,
  util.wrapAsyncApi(async (req, res) => {
    const cube = await Cube.findOne(buildIdQuery(req.params.id));
    if (!isCubeViewable(cube, req.user)) {
      return res.status(404).send({
        success: 'false',
        message: 'Cube Not Found',
      });
    }

    if (!req.user._id.equals(cube.owner)) {
      return res.status(403).send({
        success: 'false',
        message: 'Unauthorized',
      });
    }

    const update = req.body;
    for (const field of ['privatePrices', 'defaultStatus', 'defaultPrinting', 'disableNotifications', 'useCubeElo']) {
      if (update[field] !== undefined) {
        cube[field] = update[field];
      }
    }

    // convert visibility value to indicators
    switch (req.body.visibility) {
      case 'private':
        if (cube.isFeatured || (await isInFeaturedQueue(cube))) {
          req.flash('danger', 'Cannot set a cube in featured queue as private');
        } else {
          cube.isListed = false;
          cube.isPrivate = true;
        }
        break;
      case 'unlisted':
        cube.isListed = false;
        cube.isPrivate = false;
        break;
      case 'public':
        cube.isListed = true;
        cube.isPrivate = false;
        break;
      default:
        break; // can't occur due to the validation above
    }

    await cube.save();
    return res.status(200).send({
      success: 'true',
    });
  }),
);

router.get('/imagedict', (_, res) => {
  res.status(200).send({
    success: 'true',
    dict: carddb.imagedict,
  });
});

router.get('/fullnames', (_, res) => {
  res.status(200).send({
    success: 'true',
    cardnames: carddb.full_names,
  });
});

router.get('/usercubes/:id', async (req, res) => {
  const cubes = await Cube.find({
    owner: req.params.id,
    ...(req.user && req.user._id.equals(req.params.id)
      ? {}
      : {
          isListed: true,
        }),
  }).lean();

  res.status(200).send({
    success: 'true',
    cubes,
  });
});

router.get(
  '/cubecardnames/:id',
  util.wrapAsyncApi(async (req, res) => {
    const cube = await Cube.findOne(buildIdQuery(req.params.id)).lean();

    if (!isCubeViewable(cube, req.user)) {
      return res.status(404).send({
        success: 'false',
        message: 'Not found',
      });
    }

    const cardnames = [];
    for (const card of cube.cards) {
      util.binaryInsert(carddb.cardFromId(card.cardID).name, cardnames);
    }

    const result = util.turnToTree(cardnames);
    return res.status(200).send({
      success: 'true',
      cardnames: result,
    });
  }),
);

router.get(
  '/cubecardtags/:id',
  util.wrapAsyncApi(async (req, res) => {
    const cube = await Cube.findOne(buildIdQuery(req.params.id)).lean();
    if (!isCubeViewable(cube, req.user)) {
      return res.status(404).send({
        success: 'false',
        message: 'Not Found',
      });
    }
    const tags = cubeCardTags(cube);

    return res.status(200).send({
      success: 'true',
      tags: util.turnToTree(tags),
    });
  }),
);

router.post(
  '/getdetailsforcards',
  util.wrapAsyncApi(async (req, res) => {
    return res.status(200).send({
      success: 'true',
      details: req.body.cards.map((id) => carddb.cardFromId(id)),
    });
  }),
);

router.post(
  '/saveshowtagcolors',
  ensureAuth,
  body('show_tag_colors').toBoolean(),
  jsonValidationErrors,
  util.wrapAsyncApi(async (req, res) => {
    req.user.hide_tag_colors = !req.body.show_tag_colors;
    await req.user.save();

    return res.status(200).send({
      success: 'true',
    });
  }),
);

router.post(
  '/savetagcolors/:id',
  util.wrapAsyncApi(async (req, res) => {
    const cube = await Cube.findOne(buildIdQuery(req.params.id));
    if (!isCubeViewable(cube, req.user)) {
      return res.status(404).send({
        success: 'false',
        message: 'Not Found',
      });
    }

    if (!req.user._id.equals(cube.owner)) {
      return res.status(401).send({
        success: 'false',
      });
    }

    cube.tag_colors = req.body;

    await cube.save();
    return res.status(200).send({
      success: 'true',
    });
  }),
);

router.get(
  '/cubetagcolors/:id',
  util.wrapAsyncApi(async (req, res) => {
    const cube = await Cube.findOne(buildIdQuery(req.params.id)).lean();

    if (!isCubeViewable(cube, req.user)) {
      return req.status(404).send({
        success: 'false',
        message: 'Not Found',
      });
    }

    const tagColors = buildTagColors(cube);
    const tags = tagColors.map((item) => item.tag);

    // this is for the case of cube compare
    const cubeB = await Cube.findOne(buildIdQuery(req.query.b_id)).lean();

    if (cubeB) {
      if (!isCubeViewable(cubeB, req.user)) {
        return res.status(404).send({
          success: 'false',
          message: 'Not Found',
        });
      }

      const bTagColors = buildTagColors(cubeB);
      for (const bTag of bTagColors) {
        if (!tags.includes(bTag.tag)) {
          tagColors.push(bTag);
        }
      }
    }

    const showTagColors = req.user ? !req.user.hide_tag_colors : true;

    return res.status(200).send({
      success: 'true',
      tagColors,
      showTagColors,
    });
  }),
);

router.get(
  '/getcardfromcube/:id',
  util.wrapAsyncApi(async (req, res) => {
    const split = req.params.id.split(';');
    const cubeid = split[0];
    let cardname = split[1];
    cardname = cardutil.decodeName(cardname);
    cardname = cardutil.normalizeName(cardname);

    const cube = await Cube.findOne(buildIdQuery(cubeid)).lean();
    if (!isCubeViewable(cube, req.user)) {
      return req.status(404).send({
        success: 'false',
        message: 'Not Found',
      });
    }

    for (const card of cube.cards) {
      if (carddb.cardFromId(card.cardID).name_lower === cardname) {
        card.details = carddb.cardFromId(card.cardID);
        return res.status(200).send({
          success: 'true',
          card: card.details,
        });
      }
    }
    return res.status(200).send({
      success: 'true',
    });
  }),
);

router.get(
  '/cubelist/:id',
  util.wrapAsyncApi(async (req, res) => {
    const cube = await Cube.findOne(buildIdQuery(req.params.id)).lean();

    if (!isCubeViewable(cube, req.status)) {
      return res.status(404).send('Cube not found.');
    }

    const names = cube.cards.map((card) => carddb.cardFromId(card.cardID).name);
    res.contentType('text/plain');
    res.set('Access-Control-Allow-Origin', '*');
    return res.status(200).send(names.join('\n'));
  }),
);

router.get(
  '/cubeJSON/:id',
  util.wrapAsyncApi(async (req, res) => {
    const cube = await Cube.findOne(buildIdQuery(req.params.id)).lean();

    if (!isCubeViewable(cube, req.user)) {
      return res.status(404).send('Cube not found.');
    }

    res.contentType('application/json');
    return res.status(200).send(JSON.stringify(cube));
  }),
);

router.post('/redraft/:id/:seat', async (req, res) => {
  try {
    // TODO: Handle gridDraft here.
    const srcDraft = await Draft.findById(req.params.id).lean();
    const seat = parseInt(req.params.seat, 10);
    if (!srcDraft) {
      req.flash('danger', 'This deck is not able to be redrafted.');
      return res.redirect(`/cube/deck/${req.params.id}`);
    }
    if (!Number.isInteger(seat) || seat < 0 || seat >= srcDraft.seats.length) {
      req.flash('dange', 'Did not give a valid seat number to redraft as.');
      return res.redirect(`/cube/deck/${req.params.id}`);
    }

    const cube = await Cube.findById(srcDraft.cube);
    if (!isCubeViewable(cube, req.user)) {
      req.flash('danger', 'The cube that this deck belongs to no longer exists.');
      return res.redirect(`/cube/deck/${req.params.id}`);
    }

    let draft = new Draft();
    draft.cube = srcDraft.cube;
    draft.seats = srcDraft.seats.slice();
    rotateArrayLeft(draft.seats, seat);
    draft.seats[seat].bot = null;
    draft.basics = srcDraft.basics;
    draft.initial_state = srcDraft.initial_state.slice();
    draft.cards = srcDraft.cards;

    for (let i = 0; i < draft.seats.length; i += 1) {
      draft.seats[i].bot = [];
      draft.seats[i].drafted = createPool();
      draft.seats[i].sideboard = createPool();
      draft.seats[i].pickorder = [];
      draft.seats[i].trashorder = [];
    }
    draft.seats[0].bot = null;
    draft.seats[0].userid = req.user ? req.user._id : null;
    draft.seats[0].name = req.user ? req.user.username : 'Anonymous';

    await draft.save();

    let eloOverrideDict = {};
    if (cube.useCubeElo) {
      const analytic = await CubeAnalytic.findOne({ cube: cube._id });
      if (analytic) {
        eloOverrideDict = fromEntries(analytic.cards.map((c) => [c.cardName, c.elo]));
      }
    }

    draft = await Draft.findById(draft._id).lean();
    // insert card details everywhere that needs them
    for (const card of draft.cards) {
      card.details = carddb.cardFromId(card.cardID);
      if (eloOverrideDict[card.details.name_lower]) {
        card.details.elo = eloOverrideDict[card.details.name_lower];
      }
    }
    return res.status(200).send({
      success: 'true',
      draft,
    });
  } catch (err) {
    return util.handleRouteError(req, res, err, `/cube/playtest/${encodeURIComponent(req.params.id)}`);
  }
});

router.post(
  '/updatebasics/:id',
  util.wrapAsyncApi(async (req, res) => {
    const cube = await Cube.findOne(buildIdQuery(req.params.id));

    if (!isCubeViewable(cube, req.user)) {
      return res.status(400).send({
        success: 'false',
        message: 'Cube not found',
      });
    }

    if (!req.user._id.equals(cube.owner)) {
      return res.status(403).send({
        success: 'false',
        message: 'Cube can only be updated by cube owner.',
      });
    }

    cube.basics = req.body;

    await cube.save();

    return res.status(200).send({
      success: 'true',
    });
  }),
);

router.get(
  '/getcardforcube/:id/:name',
  util.wrapAsyncApi(async (req, res) => {
    const cube = await Cube.findOne(buildIdQuery(req.params.id), 'defaultPrinting').lean();
    if (!isCubeViewable(cube, req.user)) {
      return res.status(404).send({
        success: 'false',
        message: 'Not Found',
      });
    }

    const card = carddb.getMostReasonable(req.params.name, cube.defaultPrinting);
    if (card) {
      return res.status(200).send({
        success: 'true',
        card,
      });
    }
    return res.status(200).send({
      success: 'false',
    });
  }),
);

router.get(
  '/getimage/:name',
  util.wrapAsyncApi(async (req, res) => {
    const reasonable = carddb.getMostReasonable(cardutil.decodeName(req.params.name));
    const img = reasonable ? carddb.imagedict[reasonable.name] : null;
    if (!img) {
      return res.status(200).send({
        success: 'false',
      });
    }
    return res.status(200).send({
      success: 'true',
      img,
    });
  }),
);

router.get(
  '/getcardfromid/:id',
  util.wrapAsyncApi(async (req, res) => {
    const card = carddb.cardFromId(req.params.id);
    return res.status(200).send({
      success: 'true',
      card,
    });
  }),
);

router.get(
  '/getversions/:id',
  util.wrapAsyncApi(async (req, res) => {
    const cardIds = carddb.allVersions(carddb.cardFromId(req.params.id));
    // eslint-disable-next-line prefer-object-spread
    const cards = cardIds.map((id) => Object.assign({}, carddb.cardFromId(id)));
    return res.status(200).send({
      success: 'true',
      cards,
    });
  }),
);

router.post(
  '/getversions',
  body([], 'Body must be an array.').isArray(),
  body('*', 'Each ID must be a valid UUID.').matches(
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}2?$/,
  ),
  jsonValidationErrors,
  util.wrapAsyncApi(async (req, res) => {
    const allDetails = req.body.map((cardID) => carddb.cardFromId(cardID));
    const allIds = allDetails.map(({ name }) => carddb.getIdsFromName(name) || []);
    const allVersions = allIds.map((versions) =>
      versions.map((id) => carddb.cardFromId(id)).sort((a, b) => -a.released_at.localeCompare(b.released_at)),
    );

    const result = util.fromEntries(
      allVersions.map((versions, index) => [
        cardutil.normalizeName(allDetails[index].name),
        versions.map(({ _id, full_name, image_normal, image_flip, prices, elo }) => ({
          _id,
          version: full_name.toUpperCase().substring(full_name.indexOf('[') + 1, full_name.indexOf(']')),
          image_normal,
          image_flip,
          price: prices.usd,
          price_foil: prices.usd_foil,
          price_etched: prices.usd_etched,
          elo,
        })),
      ]),
    );

    return res.status(200).send({
      success: 'true',
      dict: result,
    });
  }),
);

router.post(
  '/updatecard/:id',
  ensureAuth,
  util.wrapAsyncApi(async (req, res) => {
    const { src, updated } = req.body;
    if (
      !src ||
      (src && typeof src.index !== 'number') ||
      (updated.cardID && typeof updated.cardID !== 'string') ||
      (updated.cmc && (typeof updated.cmc !== 'number' || updated.cmc < 0 || !Number.isInteger(updated.cmc * 2))) ||
      (updated.status && typeof updated.status !== 'string') ||
      (updated.type_line && typeof updated.type_line !== 'string') ||
      (updated.colors && !Array.isArray(updated.colors)) ||
      (updated.tags && !Array.isArray(updated.tags)) ||
      (updated.finish && typeof updated.finish !== 'string')
    ) {
      return res.status(400).send({
        success: 'false',
        message: 'Failed input validation',
      });
    }
    const cube = await Cube.findOne(buildIdQuery(req.params.id));
    if (!isCubeViewable(cube, req.user)) {
      return res.status(404).send({
        success: 'false',
        message: 'Cube not found',
      });
    }

    if (!req.user._id.equals(cube.owner)) {
      return res.status(401).send({
        success: 'false',
        message: 'Insufficient permissions',
      });
    }
    if (src.index >= cube.cards.length) {
      return res.status(400).send({
        success: 'false',
        message: 'No such card',
      });
    }

    const card = cube.cards[src.index];
    if (!card.type_line) {
      card.type_line = carddb.cardFromId(card.cardID).type;
    }

    if (!cardsAreEquivalent(src, card)) {
      return res.status(400).send({
        success: 'false',
        message: 'Cards not equivalent',
      });
    }

    for (const key of Object.keys(Cube.schema.paths.cards.schema.paths)) {
      if (!Object.prototype.hasOwnProperty.call(updated, key)) {
        updated[key] = card[key];
      }
    }
    for (const key of Object.keys(updated)) {
      if (updated[key] === null) {
        delete updated[key];
      }
    }
    cube.cards[src.index] = updated;

    setCubeType(cube, carddb);

    await cube.save();
    return res.status(200).send({
      success: 'true',
    });
  }),
);

router.post(
  '/updatecards/:id',
  ensureAuth,
  util.wrapAsyncApi(async (req, res) => {
    const { selected, updated } = req.body;
    if (
      (updated.cmc && typeof updated.cmc !== 'number') ||
      (updated.status && typeof updated.status !== 'string') ||
      (updated.type_line && typeof updated.type_line !== 'string') ||
      (updated.colors && !Array.isArray(updated.colors)) ||
      (updated.tags && !Array.isArray(updated.tags)) ||
      !Array.isArray(selected) ||
      selected.some((index) => !Number.isInteger(index) || index < 0)
    ) {
      return res.status(400).send({
        success: 'false',
        message: 'Failed input validation',
      });
    }

    const cube = await Cube.findOne(buildIdQuery(req.params.id));
    if (!isCubeViewable(cube, req.user)) {
      return res.status(404).send({
        success: 'false',
        message: 'Cube not found',
      });
    }
    if (!req.user._id.equals(cube.owner)) {
      return res.status(403).send({
        success: 'false',
        message: 'Unauthorized',
      });
    }

    const allUpdates = {
      $set: {},
    };
    for (const index of selected) {
      if (updated.status) {
        allUpdates.$set[`cards.${index}.status`] = updated.status;
      }
      if (updated.cmc) {
        allUpdates.$set[`cards.${index}.cmc`] = updated.cmc;
      }
      if (updated.type_line) {
        allUpdates.$set[`cards.${index}.type_line`] = updated.type_line;
      }
      if (updated.colors) {
        allUpdates.$set[`cards.${index}.colors`] = updated.colors.filter((color) => [...'WUBRG'].includes(color));
      }
      if (updated.colorC) {
        allUpdates.$set[`cards.${index}.colors`] = [];
      }
      if (updated.finish) {
        allUpdates.$set[`cards.${index}.finish`] = updated.finish;
      }
      if (updated.tags) {
        if (updated.addTags) {
          if (!allUpdates.$addToSet) {
            allUpdates.$addToSet = {};
          }
          allUpdates.$addToSet[`cards.${index}.tags`] = updated.tags;
        }
        if (updated.deleteTags) {
          if (!allUpdates.$pullAll) {
            allUpdates.$pullAll = {};
          }
          allUpdates.$pullAll[`cards.${index}.tags`] = updated.tags;
        }
      }
    }

    await cube.updateOne(allUpdates);
    return res.status(200).send({
      success: 'true',
    });
  }),
);

router.post(
  '/adds/:id',
  util.wrapAsyncApi(async (req, res) => {
    const response = await fetch(
      `${process.env.FLASKROOT}/?cube_name=${encodeURIComponent(
        req.params.id,
      )}&num_recs=${1000}&root=${encodeURIComponent(process.env.HOST)}`,
    );
    if (!response.ok) {
      req.logger.error({
        message: 'Flask server response not OK.',
      });
      return res.status(500).send({
        success: 'false',
        result: {},
      });
    }
    const { cuts, additions } = await response.json();

    // use this instead if you want debug data
    // const additions = { island: 1, mountain: 1, plains: 1, forest: 1, swamp: 1, wastes: 1 };
    // const cuts = { ...additions };

    const pids = new Set();
    const cardNames = new Set();

    const formatTuple = (tuple) => {
      const details = carddb.getMostReasonable(tuple[0]);
      const card = util.newCard(details);
      card.details = details;

      if (card.details.tcgplayer_id) {
        pids.add(card.details.tcgplayer_id);
      }
      cardNames.add(card.details.name);

      return card;
    };

    const addlist = Object.entries(additions)
      .sort((a, b) => b[1] - a[1])
      .map(formatTuple);

    // this is sorted the opposite way, as lower numbers mean we want to cut it
    const cutlist = Object.entries(cuts)
      .sort((a, b) => a[1] - b[1])
      .map(formatTuple);

    return res.status(200).send({
      success: 'true',
      result: {
        toAdd: addlist,
        toCut: cutlist,
      },
    });
  }),
);

router.get(
  '/maybe/:id',
  ensureAuth,
  util.wrapAsyncApi(async (req, res) => {
    const cube = await Cube.findOne(buildIdQuery(req.params.id)).lean();
    if (!isCubeViewable(cube, req.user)) {
      return res.status(404).send({
        success: 'false',
        message: 'Cube not found',
      });
    }
    return res.status(200).send({
      success: 'true',
      maybe: maybeCards(cube, carddb),
    });
  }),
);

router.post(
  '/addtocube/:id',
  ensureAuth,
  util.wrapAsyncApi(async (req, res) => {
    let cube = await Cube.findOne(buildIdQuery(req.params.id));

    if (!isCubeViewable(cube, req.user)) {
      return res.status(400).send({
        success: 'false',
        message: 'Cube not found',
      });
    }

    if (!req.user._id.equals(cube.owner)) {
      return res.status(403).send({
        success: 'false',
        message: 'Cube can only be updated by cube owner.',
      });
    }

    let tag = null;
    if (req.body.packid) {
      const pack = await Package.findById(req.body.packid);
      if (pack) {
        tag = pack.title;
      }
    }

    if (tag) {
      cube.cards.push(
        ...req.body.cards.map((id) => {
          const c = util.newCard(carddb.cardFromId(id));
          c.tags = [tag];
          c.notes = `Added from package "${tag}": ${process.env.HOST}/packages/${req.body.packid}`;
          return c;
        }),
      );
    } else {
      cube.cards.push(...req.body.cards.map((id) => util.newCard(carddb.cardFromId(id))));
    }

    cube = setCubeType(cube, carddb);
    await cube.save();

    if (tag) {
      const blogpost = new Blog();
      blogpost.title = `Added Package "${tag}"`;
      blogpost.changelist = req.body.cards.reduce(
        (changes, card) => changes + addCardHtml(carddb.cardFromId(card)),
        '',
      );
      blogpost.markdown = `Add from the package [${tag}](/packages/${req.body.packid})`;
      blogpost.owner = cube.owner;
      blogpost.date = Date.now();
      blogpost.cube = cube._id;
      blogpost.dev = 'false';
      blogpost.date_formatted = blogpost.date.toLocaleString('en-US');
      blogpost.username = cube.owner_name;
      blogpost.cubename = cube.name;

      await blogpost.save();
    }

    return res.status(200).send({
      success: 'true',
    });
  }),
);

router.post(
  '/maybe/:id',
  ensureAuth,
  util.wrapAsyncApi(async (req, res) => {
    const cube = await Cube.findOne(buildIdQuery(req.params.id));

    if (!isCubeViewable(cube, req.user)) {
      return res.status(400).send({
        success: 'false',
        message: 'Cube not found',
      });
    }

    if (!req.user._id.equals(cube.owner)) {
      return res.status(403).send({
        success: 'false',
        message: 'Maybeboard can only be updated by owner.',
      });
    }

    const maybe = [...(cube.maybe || [])];

    const removeIndices = Array.isArray(req.body.remove) ? req.body.remove : [];
    const withRemoved = maybe.filter((_, index) => !removeIndices.includes(index));

    const addCards = Array.isArray(req.body.add) ? req.body.add : [];
    const addCardsNoDetails = addCards.map(({ details, ...card }) => ({
      ...util.newCard(details),
      ...card,
    }));
    const withAdded = [...withRemoved, ...addCardsNoDetails];

    cube.maybe = withAdded;
    await cube.save();

    const added = cube.maybe.slice(cube.maybe.length - addCardsNoDetails.length);

    return res.status(200).send({
      success: 'true',
      added: util.fromEntries(added.map(({ _id, cardID }) => [cardID, _id])),
    });
  }),
);

router.post(
  '/maybe/update/:id',
  ensureAuth,
  util.wrapAsyncApi(async (req, res) => {
    const cube = await Cube.findOne(buildIdQuery(req.params.id));
    if (!isCubeViewable(cube, req.user)) {
      return res.status(404).send({
        success: 'false',
        message: 'Cube not found',
      });
    }
    if (!req.user._id.equals(cube.owner)) {
      return res.status(403).send({
        success: 'false',
        message: 'Maybeboard can only be updated by cube owner.',
      });
    }

    const card = cube.maybe.find((c) => c._id.equals(req.body.id));
    if (!card) {
      return res.status(404).send({
        success: 'false',
        message: 'No card found to update.',
      });
    }

    const { updated } = req.body;
    if (!updated) {
      return res.status(400).send({
        success: 'false',
        message: 'Bad request.',
      });
    }
    const newVersion = updated.cardID && updated.cardID !== card.cardID;
    for (const field of ['cardID', 'status', 'finish', 'cmc', 'type_line', 'imgUrl', 'imgBackUrl', 'colors']) {
      if (Object.prototype.hasOwnProperty.call(updated, field)) {
        card[field] = updated[field];
      }
    }
    await cube.save();

    if (newVersion) {
      return res.status(200).send({
        success: 'true',
        details: carddb.cardFromId(card.cardID),
      });
    }

    return res.status(200).send({
      success: 'true',
    });
  }),
);

router.post(
  '/savesorts/:id',
  ensureAuth,
  util.wrapAsyncApi(async (req, res) => {
    const cube = await Cube.findOne(buildIdQuery(req.params.id));
    if (!isCubeViewable(cube, req.user)) {
      return res.status(404).send({
        success: 'false',
        message: 'Cube not found',
      });
    }
    if (!req.user._id.equals(cube.owner)) {
      return res.status(403).send({
        success: 'false',
        message: 'Unauthorized',
      });
    }

    cube.default_sorts = req.body.sorts;
    cube.default_show_unsorted = !!req.body.showOther;
    await cube.save();
    return res.status(200).send({
      success: 'true',
    });
  }),
);

router.post('/submitdraft/:id', async (req, res) => {
  const draft = await Draft.findOne({
    _id: req.body._id,
  });
  draft.seats = req.body.seats;
  await draft.save();

  await saveDraftAnalytics(draft, 0, carddb);

  return res.status(200).send({
    success: 'true',
  });
});

router.post('/submitgriddraft/:id', async (req, res) => {
  await GridDraft.updateOne(
    {
      _id: req.body._id,
    },
    req.body,
  );

  return res.status(200).send({
    success: 'true',
  });
});

router.get(
  '/p1p1/:id',
  util.wrapAsyncApi(async (req, res) => {
    const cube = await Cube.findById(buildIdQuery(req.params.id)).lean();
    if (!isCubeViewable(cube, req.user)) {
      return res.status(404).send({
        success: 'false',
        message: 'Cube not found',
      });
    }
    const result = await generatePack(cube, carddb, false);

    return res.status(200).send({
      seed: result.seed,
      pack: result.pack.map((card) => card.name),
    });
  }),
);

router.get(
  '/p1p1/:id/:seed',
  util.wrapAsyncApi(async (req, res) => {
    const cube = await Cube.findById(buildIdQuery(req.params.id)).lean();
    if (!isCubeViewable(cube, req.user)) {
      return res.status(404).send({
        success: 'false',
        message: 'Cube not found',
      });
    }
    const result = await generatePack(cube, carddb, req.params.seed);

    return res.status(200).send({
      seed: req.params.seed,
      pack: result.pack.map((card) => card.name),
    });
  }),
);

router.get(
  '/date_updated/:id',
  util.wrapAsyncApi(async (req, res) => {
    const { id } = req.params;
    const result = await Cube.findOne(buildIdQuery(id), 'date_updated isPrivate owner').lean();
    if (!isCubeViewable(result, req.user)) {
      return res.status(404).send({
        success: 'false',
        message: 'No such cube.',
      });
    }
    return res.status(200).send({
      success: 'true',
      date_updated: result.date_updated.valueOf(),
    });
  }),
);

module.exports = router;
