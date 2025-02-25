// Load Environment Variables
require('dotenv').config();

const express = require('express');
const { body } = require('express-validator');
const mailer = require('nodemailer');
const path = require('path');
const Email = require('email-templates');
const parser = require('../dist/markdown/parser');
const { ensureRole, csrfProtection, flashValidationErrors } = require('./middleware');

const User = require('../models/user');
const Report = require('../models/report');
const Application = require('../models/application');
const Comment = require('../models/comment');
const Article = require('../models/article');
const Video = require('../models/video');
const Podcast = require('../models/podcast');
const FeaturedCubes = require('../models/featuredCubes');
const Cube = require('../models/cube');
const { render } = require('../serverjs/render');
const { buildIdQuery } = require('../serverjs/cubefn.js');
const util = require('../serverjs/util.js');
const fq = require('../serverjs/featuredQueue');

const ensureAdmin = ensureRole('Admin');

const router = express.Router();

router.use(csrfProtection);

router.get('/dashboard', ensureAdmin, async (req, res) => {
  const commentReportCount = await Report.countDocuments();
  const applicationCount = await Application.countDocuments();
  const articlesInReview = await Article.countDocuments({ status: 'inReview' });
  const videosInReview = await Video.countDocuments({ status: 'inReview' });
  const podcastsInReview = await Podcast.countDocuments({ status: 'inReview' });

  return render(req, res, 'AdminDashboardPage', {
    commentReportCount,
    applicationCount,
    articlesInReview,
    videosInReview,
    podcastsInReview,
  });
});

const PAGE_SIZE = 24;

router.get('/comments', async (req, res) => {
  return res.redirect('/admin/comments/0');
});

router.get('/comments/:page', ensureAdmin, async (req, res) => {
  const count = await Comment.countDocuments();
  const comments = await Comment.find()
    .sort({ timePosted: -1 })
    .skip(Math.max(req.params.page, 0) * PAGE_SIZE)
    .limit(PAGE_SIZE)
    .lean();

  return render(req, res, 'AdminCommentsPage', { comments, count, page: Math.max(req.params.page, 0) });
});

router.get('/reviewarticles', async (req, res) => {
  res.redirect('/admin/reviewarticles/0');
});

router.get('/reviewvideos', async (req, res) => {
  res.redirect('/admin/reviewvideos/0');
});

router.get('/reviewpodcasts', async (req, res) => {
  res.redirect('/admin/reviewpodcasts/0');
});

router.get('/reviewarticles/:page', ensureAdmin, async (req, res) => {
  const count = await Article.countDocuments({ status: 'inReview' });
  const articles = await Article.find({ status: 'inReview' })
    .sort({ date: -1 })
    .skip(Math.max(req.params.page, 0) * PAGE_SIZE)
    .limit(PAGE_SIZE)
    .lean();

  return render(req, res, 'ReviewArticlesPage', { articles, count, page: Math.max(req.params.page, 0) });
});

router.get('/reviewvideos/:page', ensureAdmin, async (req, res) => {
  const count = await Video.countDocuments({ status: 'inReview' });
  const videos = await Video.find({ status: 'inReview' })
    .sort({ date: -1 })
    .skip(Math.max(req.params.page, 0) * PAGE_SIZE)
    .limit(PAGE_SIZE)
    .lean();

  return render(req, res, 'ReviewVideosPage', { videos, count, page: Math.max(req.params.page, 0) });
});

router.get('/reviewpodcasts/:page', ensureAdmin, async (req, res) => {
  const count = await Podcast.countDocuments({ status: 'inReview' });
  const podcasts = await Podcast.find({ status: 'inReview' })
    .sort({ date: -1 })
    .skip(Math.max(req.params.page, 0) * PAGE_SIZE)
    .limit(PAGE_SIZE)
    .lean();

  return render(req, res, 'ReviewPodcastsPage', { podcasts, count, page: Math.max(req.params.page, 0) });
});

router.get('/commentreports', async (req, res) => {
  return res.redirect('/admin/commentreports/0');
});

router.get('/commentreports/:page', ensureAdmin, async (req, res) => {
  const count = await Report.countDocuments();
  const reports = await Report.find()
    .sort({ timePosted: -1 })
    .skip(Math.max(req.params.page, 0) * PAGE_SIZE)
    .limit(PAGE_SIZE)
    .lean();

  return render(req, res, 'CommentReportsPage', { reports, count, page: Math.max(req.params.page, 0) });
});

router.get('/applications', async (req, res) => {
  return res.redirect('/admin/applications/0');
});

router.get('/applications/:page', ensureAdmin, async (req, res) => {
  const count = await Application.countDocuments();
  const applications = await Application.find()
    .sort({ timePosted: -1 })
    .skip(Math.max(req.params.page, 0) * PAGE_SIZE)
    .limit(PAGE_SIZE)
    .lean();

  return render(req, res, 'ApplicationsPage', { applications, count, page: Math.max(req.params.page, 0) });
});

router.get('/publisharticle/:id', ensureAdmin, async (req, res) => {
  const article = await Article.findById(req.params.id);

  if (article.status !== 'inReview') {
    req.flash('danger', `Article not in review`);
    return res.redirect('/admin/reviewarticles/0');
  }

  article.status = 'published';
  article.date = new Date();

  const owner = await User.findById(article.owner);

  await article.save();

  if (owner) {
    await util.addNotification(
      owner,
      req.user,
      `/content/article/${article._id}`,
      `${req.user.username} has approved and published your article: ${article.title}`,
    );

    const mentions = parser.findUserLinks(article.body).map((x) => x.toLowerCase());
    if (mentions.length) {
      const query = User.find({ username_lower: mentions });
      await util.addMultipleNotifications(
        query,
        owner,
        `/content/article/${article._id}`,
        `${owner.username} mentioned you in their article`,
      );
    }
  }

  const smtpTransport = mailer.createTransport({
    name: 'CubeCobra.com',
    secure: true,
    service: 'Gmail',
    auth: {
      user: process.env.EMAIL_CONFIG_USERNAME,
      pass: process.env.EMAIL_CONFIG_PASSWORD,
    },
  });

  const email = new Email({
    message: {
      from: 'Cube Cobra Team <support@cubecobra.com>',
      to: owner.email,
      subject: 'Your article has been published',
    },
    send: true,
    juiceResources: {
      webResources: {
        relativeTo: path.join(__dirname, '..', 'public'),
        images: true,
      },
    },
    transport: smtpTransport,
  });

  email.send({
    template: 'content_publish',
    locals: { title: article.title, url: `https://cubecobra.com/content/article/${article._id}`, type: 'article' },
  });

  req.flash('success', `Article published: ${article.title}`);

  return res.redirect('/admin/reviewarticles/0');
});

router.get('/publishvideo/:id', ensureAdmin, async (req, res) => {
  const video = await Video.findById(req.params.id);

  if (video.status !== 'inReview') {
    req.flash('danger', `Video not in review`);
    return res.redirect('/admin/reviewvideos/0');
  }

  video.status = 'published';
  video.date = new Date();

  const owner = await User.findById(video.owner);

  await video.save();

  if (owner) {
    await util.addNotification(
      owner,
      req.user,
      `/content/video/${video._id}`,
      `${req.user.username} has approved and published your video: ${video.title}`,
    );

    const mentions = parser.findUserLinks(video.body).map((x) => x.toLowerCase());
    if (mentions.length) {
      const query = User.find({ username_lower: mentions });
      await util.addMultipleNotifications(
        query,
        owner,
        `/content/video/${video._id}`,
        `${owner.username} mentioned you in their video`,
      );
    }
  }

  const smtpTransport = mailer.createTransport({
    name: 'CubeCobra.com',
    secure: true,
    service: 'Gmail',
    auth: {
      user: process.env.EMAIL_CONFIG_USERNAME,
      pass: process.env.EMAIL_CONFIG_PASSWORD,
    },
  });

  const email = new Email({
    message: {
      from: 'Cube Cobra Team <support@cubecobra.com>',
      to: owner.email,
      subject: 'Your video has been published',
    },
    send: true,
    juiceResources: {
      webResources: {
        relativeTo: path.join(__dirname, '..', 'public'),
        images: true,
      },
    },
    transport: smtpTransport,
  });

  email.send({
    template: 'content_publish',
    locals: { title: video.title, url: `https://cubecobra.com/content/video/${video._id}`, type: 'video' },
  });

  req.flash('success', `Video published: ${video.title}`);

  return res.redirect('/admin/reviewvideos/0');
});

router.get('/publishpodcast/:id', ensureAdmin, async (req, res) => {
  const podcast = await Podcast.findById(req.params.id);

  if (podcast.status !== 'inReview') {
    req.flash('danger', `Podcast not in review`);
    return res.redirect('/admin/reviewpodcasts/0');
  }

  podcast.status = 'published';
  podcast.date = new Date();

  const owner = await User.findById(podcast.owner);

  await podcast.save();

  if (owner) {
    await util.addNotification(
      owner,
      req.user,
      `/content/podcast/${podcast._id}`,
      `${req.user.username} has approved your podcast: ${podcast.title}`,
    );
  }

  const smtpTransport = mailer.createTransport({
    name: 'CubeCobra.com',
    secure: true,
    service: 'Gmail',
    auth: {
      user: process.env.EMAIL_CONFIG_USERNAME,
      pass: process.env.EMAIL_CONFIG_PASSWORD,
    },
  });

  const email = new Email({
    message: {
      from: 'Cube Cobra Team <support@cubecobra.com>',
      to: owner.email,
      subject: 'Your podcast has been approved',
    },
    send: true,
    juiceResources: {
      webResources: {
        relativeTo: path.join(__dirname, '..', 'public'),
        images: true,
      },
    },
    transport: smtpTransport,
  });

  await email.send({
    template: 'content_publish',
    locals: { title: podcast.title, url: `https://cubecobra.com/content/podcast/${podcast._id}`, type: 'podcast' },
  });

  req.flash('success', `Podcast published: ${podcast.title}`);

  return res.redirect('/admin/reviewpodcasts/0');
});

router.get('/removearticlereview/:id', ensureAdmin, async (req, res) => {
  const article = await Article.findById(req.params.id);

  if (article.status !== 'inReview') {
    req.flash('danger', `Article not in review`);
    return res.redirect('/admin/reviewarticles/0');
  }

  article.status = 'draft';
  article.date = new Date();

  const owner = await User.findById(article.owner);

  await article.save();

  if (owner) {
    await util.addNotification(
      owner,
      req.user,
      `/content/article/${article._id}`,
      `${req.user.username} has declined to publish your article: ${article.title}`,
    );
  }

  const smtpTransport = mailer.createTransport({
    name: 'CubeCobra.com',
    secure: true,
    service: 'Gmail',
    auth: {
      user: process.env.EMAIL_CONFIG_USERNAME,
      pass: process.env.EMAIL_CONFIG_PASSWORD,
    },
  });

  const email = new Email({
    message: {
      from: 'Cube Cobra Team <support@cubecobra.com>',
      to: owner.email,
      subject: 'Your article was not published',
    },
    send: true,
    juiceResources: {
      webResources: {
        relativeTo: path.join(__dirname, '..', 'public'),
        images: true,
      },
    },
    transport: smtpTransport,
  });

  await email.send({
    template: 'content_decline',
    locals: { title: article.title, url: `https://cubecobra.com/content/article/${article._id}`, type: 'article' },
  });

  req.flash('success', `Article declined: ${article.title}`);

  return res.redirect('/admin/reviewarticles/0');
});

router.get('/removevideoreview/:id', ensureAdmin, async (req, res) => {
  const video = await Video.findById(req.params.id);

  if (video.status !== 'inReview') {
    req.flash('danger', `Video not in review`);
    return res.redirect('/admin/reviewvideos/0');
  }

  video.status = 'draft';
  video.date = new Date();

  const owner = await User.findById(video.owner);

  await video.save();

  if (owner) {
    await util.addNotification(
      owner,
      req.user,
      `/content/video/${video._id}`,
      `${req.user.username} has declined to publish your video: ${video.title}`,
    );
  }

  const smtpTransport = mailer.createTransport({
    name: 'CubeCobra.com',
    secure: true,
    service: 'Gmail',
    auth: {
      user: process.env.EMAIL_CONFIG_USERNAME,
      pass: process.env.EMAIL_CONFIG_PASSWORD,
    },
  });

  const email = new Email({
    message: {
      from: 'Cube Cobra Team <support@cubecobra.com>',
      to: owner.email,
      subject: 'Your video was not published',
    },
    send: true,
    juiceResources: {
      webResources: {
        relativeTo: path.join(__dirname, '..', 'public'),
        images: true,
      },
    },
    transport: smtpTransport,
  });

  await email.send({
    template: 'content_decline',
    locals: { title: video.title, url: `https://cubecobra.com/content/video/${video._id}`, type: 'video' },
  });

  req.flash('success', `Video declined: ${video.title}`);

  return res.redirect('/admin/reviewvideos/0');
});

router.get('/removepodcastreview/:id', ensureAdmin, async (req, res) => {
  const podcast = await Podcast.findById(req.params.id);

  if (podcast.status !== 'inReview') {
    req.flash('danger', `podcast not in review`);
    return res.redirect('/admin/reviewpodcasts/0');
  }

  podcast.status = 'draft';
  podcast.date = new Date();

  const owner = await User.findById(podcast.owner);

  await podcast.save();

  if (owner) {
    await util.addNotification(
      owner,
      req.user,
      `/content/podcast/${podcast._id}`,
      `${req.user.username} has declined your podcast: ${podcast.title}`,
    );
  }

  const smtpTransport = mailer.createTransport({
    name: 'CubeCobra.com',
    secure: true,
    service: 'Gmail',
    auth: {
      user: process.env.EMAIL_CONFIG_USERNAME,
      pass: process.env.EMAIL_CONFIG_PASSWORD,
    },
  });

  const email = new Email({
    message: {
      from: 'Cube Cobra Team <support@cubecobra.com>',
      to: owner.email,
      subject: 'Your podcast was not approved',
    },
    send: true,
    juiceResources: {
      webResources: {
        relativeTo: path.join(__dirname, '..', 'public'),
        images: true,
      },
    },
    transport: smtpTransport,
  });

  await email.send({
    template: 'content_decline',
    locals: { title: podcast.title, url: `https://cubecobra.com/content/podcast/${podcast._id}`, type: 'podcast' },
  });

  req.flash('success', `Podcast declined: ${podcast.title}`);

  return res.redirect('/admin/reviewpodcasts/0');
});

router.get('/ignorereport/:id', ensureAdmin, async (req, res) => {
  const report = await Report.findById(req.params.id);

  await Report.deleteMany({ commentid: report.commentid });

  req.flash('success', 'All reports for this comment have been deleted.');
  return res.redirect('/admin/commentreports/0');
});

router.get('/removecomment/:id', ensureAdmin, async (req, res) => {
  const report = await Report.findById(req.params.id);
  const comment = await Comment.findById(report.commentid);

  comment.owner = null;
  comment.ownerName = null;
  comment.image =
    'https://img.scryfall.com/cards/art_crop/front/0/c/0c082aa8-bf7f-47f2-baf8-43ad253fd7d7.jpg?1562826021';
  comment.artist = 'Allan Pollack';
  comment.updated = true;
  comment.content = '[removed by moderator]';
  // the -1000 is to prevent weird time display error
  comment.timePosted = Date.now() - 1000;

  await comment.save();

  req.flash('success', 'This comment has been deleted.');
  return res.redirect(`/admin/ignorereport/${report._id}`);
});

router.get('/application/approve/:id', ensureAdmin, async (req, res) => {
  const application = await Application.findById(req.params.id);

  const user = await User.findById(application.userid);
  if (!user.roles) {
    user.roles = [];
  }
  if (!user.roles.includes('ContentCreator')) {
    user.roles.push('ContentCreator');
  }
  await user.save();

  await Application.deleteOne({ _id: application._id });

  const smtpTransport = mailer.createTransport({
    name: 'CubeCobra.com',
    secure: true,
    service: 'Gmail',
    auth: {
      user: process.env.EMAIL_CONFIG_USERNAME,
      pass: process.env.EMAIL_CONFIG_PASSWORD,
    },
  });

  const email = new Email({
    message: {
      from: 'Cube Cobra Team <support@cubecobra.com>',
      to: user.email,
      subject: 'Cube Cobra Content Creator',
    },
    send: true,
    juiceResources: {
      webResources: {
        relativeTo: path.join(__dirname, '..', 'public'),
        images: true,
      },
    },
    transport: smtpTransport,
  });

  await email.send({
    template: 'application_approve',
    locals: {},
  });

  req.flash('success', `Application for ${user.username} approved.`);
  return res.redirect(`/admin/applications/0`);
});

router.get('/application/decline/:id', ensureAdmin, async (req, res) => {
  const application = await Application.findById(req.params.id);

  await Application.deleteOne({ _id: application._id });

  const user = await User.findById(application.userid);

  const smtpTransport = mailer.createTransport({
    name: 'CubeCobra.com',
    secure: true,
    service: 'Gmail',
    auth: {
      user: process.env.EMAIL_CONFIG_USERNAME,
      pass: process.env.EMAIL_CONFIG_PASSWORD,
    },
  });

  const email = new Email({
    message: {
      from: 'Cube Cobra Team <support@cubecobra.com>',
      to: user.email,
      subject: 'Cube Cobra Content Creator',
    },
    send: true,
    juiceResources: {
      webResources: {
        relativeTo: path.join(__dirname, '..', 'public'),
        images: true,
      },
    },
    transport: smtpTransport,
  });

  await email.send({
    template: 'application_decline',
    locals: {},
  });

  req.flash('danger', `Application declined.`);
  return res.redirect(`/admin/applications/0`);
});

router.get('/featuredcubes', ensureAdmin, async (req, res) => {
  const featured = await FeaturedCubes.getSingleton();
  const ids = featured.queue.map((f) => f.cubeID);
  const cubes = await Cube.find({ _id: { $in: ids } }).lean();

  // ensure queue is returned in correct order
  const sorted = [];
  for (const cube of featured.queue) {
    // the queue shouldn't be long enough to care about the O(n^2) complexity of this
    const found = cubes.find((c) => c._id.equals(cube.cubeID));
    if (!found) req.flash('danger', `Non-existent cube ${cube.cubeID} set as featured`);
    else sorted.push(found);
  }

  return render(req, res, 'FeaturedCubesQueuePage', {
    cubes: sorted,
    daysBetweenRotations: featured.daysBetweenRotations,
    lastRotation: featured.lastRotation,
  });
});

router.post('/featuredcubes/rotate', ensureAdmin, async (req, res) => {
  const rotate = await fq.rotateFeatured();
  for (const message of rotate.messages) {
    req.flash('danger', message);
  }

  if (rotate.success === 'false') {
    req.flash('danger', 'Featured Cube rotation failed!');
    return res.redirect('/admin/featuredcubes');
  }

  const olds = await User.find({ _id: rotate.removed.map((f) => f.ownerID) });
  const news = await User.find({ _id: rotate.added.map((f) => f.ownerID) });
  const notifications = [];
  for (const old of olds) {
    notifications.push(
      util.addNotification(old, req.user, '/user/account?nav=patreon', 'Your cube is no longer featured.'),
    );
  }
  for (const newO of news) {
    notifications.push(
      util.addNotification(newO, req.user, '/user/account?nav=patreon', 'Your cube has been featured!'),
    );
  }
  await Promise.all(notifications);
  return res.redirect('/admin/featuredcubes');
});

router.post(
  '/featuredcubes/setperiod/:days',
  ensureAdmin,
  util.wrapAsyncApi(async (req, res) => {
    const days = Number.parseInt(req.params.days, 10);
    if (!Number.isInteger(days)) {
      return res.status(400).send({
        success: 'false',
        message: 'Days between rotations must be an integer',
      });
    }

    await fq.updateFeatured(async (featured) => {
      featured.daysBetweenRotations = days;
    });
    return res.send({ success: 'true', period: days });
  }),
);

router.post('/featuredcubes/queue', ensureAdmin, async (req, res) => {
  if (!req.body.cubeId) {
    req.flash('danger', 'Cube ID not sent');
    return res.redirect('/admin/featuredcubes');
  }
  const cube = await Cube.findOne(buildIdQuery(req.body.cubeId)).lean();
  if (!cube) {
    req.flash('danger', 'Cube does not exist');
    return res.redirect('/admin/featuredcubes');
  }

  if (cube.isPrivate) {
    req.flash('danger', 'Cannot feature private cube');
    return res.redirect('/admin/featuredcubes');
  }

  const update = await fq.updateFeatured(async (featured) => {
    const index = featured.queue.findIndex((c) => c.cubeID.equals(cube._id));
    if (index !== -1) {
      throw new Error('Cube is already in queue');
    }
    featured.queue.push({ cubeID: cube._id, ownerID: cube.owner });
  });

  if (!update.ok) {
    req.flash('danger', update.message);
    return res.redirect('/admin/featuredcubes');
  }

  const user = await User.findById(cube.owner);
  await util.addNotification(
    user,
    req.user,
    '/user/account?nav=patreon',
    'An admin added your cube to the featured cubes queue.',
  );
  return res.redirect('/admin/featuredcubes');
});

router.post('/featuredcubes/unqueue', ensureAdmin, async (req, res) => {
  if (!req.body.cubeId) {
    req.flash('Cube ID not sent');
    return res.redirect('/admin/featuredcubes');
  }

  const update = await fq.updateFeatured(async (featured) => {
    const index = featured.queue.findIndex((c) => c.cubeID.equals(req.body.cubeId));
    if (index === -1) {
      throw new Error('Cube not found in queue');
    }
    if (index < 2) {
      throw new Error('Cannot remove currently featured cube from queue');
    }
    return featured.queue.splice(index, 1);
  });
  if (!update.ok) {
    req.flash('danger', update.message);
    return res.redirect('/admin/featuredcubes');
  }

  const [removed] = update.return;
  const user = await User.findById(removed.ownerID);
  await util.addNotification(
    user,
    req.user,
    '/user/account?nav=patreon',
    'An admin removed your cube from the featured cubes queue.',
  );
  return res.redirect('/admin/featuredcubes');
});

router.post(
  '/featuredcubes/move',
  ensureAdmin,
  body('cubeId', 'Cube ID must be sent').not().isEmpty(),
  body('from', 'Cannot move currently featured cube').isInt({ gt: 2 }).toInt(),
  body('to', 'Cannot move cube to featured position').isInt({ gt: 2 }).toInt(),
  flashValidationErrors,
  async (req, res) => {
    if (!req.validated) return res.redirect('/admin/featuredcubes');
    let { from, to } = req.body;
    // indices are sent in human-readable form (indexing from 1)
    from -= 1;
    to -= 1;

    const update = await fq.updateFeatured(async (featured) => {
      if (featured.queue.length <= from || !featured.queue[from].cubeID.equals(req.body.cubeId))
        throw new Error('Cube is not at expected position in queue');
      if (featured.queue.length <= to) throw new Error('Target position is higher than cube length');
      const [spliced] = featured.queue.splice(from, 1);
      featured.queue.splice(to, 0, spliced);
    });

    if (!update.ok) req.flash('danger', update.message);
    else req.flash('success', 'Successfully moved cube');

    return res.redirect('/admin/featuredcubes');
  },
);

module.exports = router;
