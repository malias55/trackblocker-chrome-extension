/*
 * Linkwash rule database.
 *
 * Every tracking parameter is listed by its exact name. Exact names keep the
 * JavaScript engine and Chrome's declarativeNetRequest rules in agreement.
 *
 * To add a rule:
 *   - a parameter that is tracking on every website goes into GLOBAL_PARAMS
 *     under the right category;
 *   - a parameter that is only tracking on one site (e.g. "ref" on Amazon)
 *     goes into SITES, so it is never stripped from other websites;
 *   - a link-wrapper ("/url?q=…", "l.php?u=…") goes into REDIRECTS.
 * Then run `npm test`. The tests check the database for duplicates and
 * overlapping sites.
 */
(function (root) {
  'use strict';

  /** Categories in display order. `default` is the initial on/off state. */
  const CATEGORIES = [
    { id: 'marketing', icon: 'megaphone', default: true },
    { id: 'ads', icon: 'target', default: true },
    { id: 'email', icon: 'mail', default: true },
    { id: 'analytics', icon: 'chart', default: true },
    { id: 'social', icon: 'share', default: true },
    { id: 'shopping', icon: 'bag', default: true },
    { id: 'search', icon: 'search', default: true },
    { id: 'affiliate', icon: 'coin', default: false }
  ];

  const utm = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
    'utm_name', 'utm_cid', 'utm_reader', 'utm_referrer', 'utm_social', 'utm_social-type',
    'utm_brand', 'utm_place', 'utm_pubreferrer', 'utm_swu', 'utm_viz_id', 'utm_int',
    'utm_keyword', 'utm_source_platform', 'utm_creative_format', 'utm_marketing_tactic',
    'utm_campaignid', 'utm_adgroup', 'utm_device', 'utm_network', 'utm_placement',
    'utm_matchtype', 'utm_audience', 'utm_type', 'utm_channel', 'utm_emcid', 'utm_emmid',
    'utm_timestamp', 'utm_mailing', 'utm_userid', 'utm_label'
  ];

  /** Parameters that are tracking-only on every website. */
  const GLOBAL_PARAMS = {
    marketing: utm.concat([
      // Matomo / Piwik
      'mtm_source', 'mtm_medium', 'mtm_campaign', 'mtm_keyword', 'mtm_kwd', 'mtm_content',
      'mtm_cid', 'mtm_group', 'mtm_placement',
      'pk_source', 'pk_medium', 'pk_campaign', 'pk_keyword', 'pk_kwd', 'pk_content',
      'pk_cid', 'pk_vid',
      'piwik_campaign', 'piwik_keyword', 'piwik_kwd',
      'matomo_campaign', 'matomo_keyword', 'matomo_source', 'matomo_medium',
      'matomo_content', 'matomo_cid', 'matomo_group', 'matomo_placement',
      // Google Analytics legacy, HubSpot, internal campaign tags
      'ga_source', 'ga_medium', 'ga_term', 'ga_content', 'ga_campaign', 'ga_place',
      'hmb_campaign', 'hmb_medium', 'hmb_source',
      'itm_source', 'itm_medium', 'itm_campaign', 'itm_content', 'itm_term',
      'stm_source', 'stm_medium', 'stm_campaign', 'stm_content', 'stm_term',
      'hsa_acc', 'hsa_cam', 'hsa_grp', 'hsa_ad', 'hsa_src', 'hsa_tgt', 'hsa_kw',
      'hsa_mt', 'hsa_net', 'hsa_ver', 'hsa_la', 'hsa_ol'
    ]),
    ads: [
      // Google Ads
      'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid', 'gad_source', 'gad_campaignid',
      'srsltid',
      // Meta, Microsoft, TikTok, X, LinkedIn, Pinterest, Snapchat, Reddit, Quora
      'fbclid', 'msclkid', 'ttclid', 'twclid', 'li_fat_id', 'epik', 'ScCid',
      'rdt_cid', 'qclid',
      // Yandex
      'yclid', 'ysclid',
      // Instagram share IDs (appear on many sites when shared from the app)
      'igshid', 'igsh',
      // Adobe, Marin, Kenshoo, Criteo, Taboola, Outbrain, others
      's_kwcid', 'ef_id', 'mkwid', 'pcrid', 'cto_pld', 'tblci', 'dicbo', 'obOrigUrl',
      'wickedid', 'vmcid', 'zanpid', 'nb_klid', 'ndclid', 'irgwc', 'irclickid',
      '_branch_match_id', '_branch_referrer'
    ],
    email: [
      // Mailchimp
      'mc_cid', 'mc_eid',
      // HubSpot
      '_hsenc', '_hsmi', '__hstc', '__hssc', '__hsfp', 'hsCtaTracking',
      // Marketo, Eloqua, Klaviyo, Omeda, Vero, Blueshift, Drip, Sendinblue, others
      'mkt_tok', 'elqTrackId', 'elqTrack', 'elq', 'elqaid', 'elqat', 'elqCampaignId',
      '_kx', 'oly_anon_id', 'oly_enc_id', 'vero_id', 'vero_conv', 'rb_clickid',
      'bsft_clkid', 'bsft_uid', 'bsft_mid', 'bsft_eid', 'bsft_ek', 'bsft_aaid',
      'bsft_mime_type', 'bsft_tv', 'bsft_lx', '__s', 'dm_i', 'ck_subscriber_id',
      'ml_subscriber', 'ml_subscriber_hash', 'ss_email_id', 'ss_campaign_id',
      'ss_source', 'sms_click', 'sms_source', 'sms_uph', 'trk_contact', 'trk_msg',
      'trk_module', 'trk_sid', 'sc_cid', 's_cid'
    ],
    analytics: [
      // Google Analytics cross-domain linker
      '_ga', '_gl', '_gac',
      // Webtrekk / Mapp (very common on German sites)
      'wt_mc', 'wt_zmc', 'WT.mc_id', 'wt.mc_id', 'WT.mc_ev', 'WT.tsrc',
      // AT Internet / Piano Analytics
      'xtor', 'at_campaign', 'at_medium', 'at_platform', 'at_creation', 'at_format',
      'at_send_date', 'at_variant', 'at_link', 'at_link_id', 'at_link_origin',
      'at_link_type', 'at_position', 'at_recipient_id', 'at_recipient_list',
      'at_ptr_name', 'at_campaign_type', 'at_custom1', 'at_custom2', 'at_custom3',
      'at_custom4',
      // Openstat, Bronto, Klaviyo, others
      '_openstat', '_bta_tid', '_bta_c', '_ke'
    ],
    affiliate: [
      'aff', 'aff_id', 'affid', 'affiliate', 'affiliate_id', 'awc', 'clickref',
      'afftrack', 'ranMID', 'ranEAID', 'ranSiteID', 'cjevent', 'cjdata'
    ]
  };

  /*
   * Site-specific parameters. `domains` match the host and all its subdomains.
   * A trailing ".*" matches any country TLD (amazon.de, amazon.co.uk, amazon.com.tr…).
   */
  const SITES = [
    {
      id: 'google', name: 'Google', domains: ['google.*'],
      params: {
        search: [
          'ved', 'ei', 'uact', 'sxsrf', 'oq', 'gs_lcp', 'gs_lcrp', 'gs_lp', 'gs_l',
          'gs_ssp', 'gs_rn', 'gs_ri', 'gs_mss', 'aqs', 'sourceid', 'sca_esv', 'sca_upv',
          'iflsig', 'sclient', 'rlz', 'bih', 'biw', 'dpr', 'prmd', 'cshid', 'fbs',
          'sei', 'stick', 'vet', 'lei', 'entry', 'g_ep'
        ]
      }
    },
    {
      id: 'bing', name: 'Bing', domains: ['bing.com'],
      params: { search: ['cvid', 'form', 'FORM', 'sk', 'sp', 'sc', 'qs', 'pq', 'ghc', 'ghsh', 'ghacc', 'ghpl'] }
    },
    {
      id: 'youtube', name: 'YouTube', domains: ['youtube.com', 'youtu.be', 'youtube-nocookie.com'],
      params: {
        social: [
          'si', 'feature', 'pp', 'ab_channel', 'embeds_referring_euri', 'embeds_euri',
          'embeds_referring_origin', 'source_ve_path'
        ]
      }
    },
    {
      id: 'facebook', name: 'Facebook', domains: ['facebook.com', 'fb.com', 'messenger.com'],
      params: {
        social: [
          'mibextid', 'rdid', 'sfnsn', 'extid', 'hc_ref', 'fref', 'hc_location', '__tn__',
          'paipv', 'eav', 'refsrc', 'acontext', 'notif_id', 'notif_t', 'ref_component',
          'ref_page'
        ]
      }
    },
    {
      id: 'instagram', name: 'Instagram', domains: ['instagram.com'],
      params: { social: ['ig_rid', 'ig_mid'] }
    },
    {
      id: 'x', name: 'X / Twitter', domains: ['x.com', 'twitter.com'],
      params: { social: ['s', 't', 'ref_src', 'ref_url', 'cxt', 'twgr'] }
    },
    {
      id: 'tiktok', name: 'TikTok', domains: ['tiktok.com'],
      params: {
        social: [
          '_r', '_t', 'is_from_webapp', 'sender_device', 'is_copy_url', 'share_app_id',
          'share_link_id', 'share_item_id', 'tt_from', 'u_code', 'timestamp', 'user_id',
          'sec_user_id', 'checksum', 'social_share_type', 'share_author_id',
          'enter_method', 'enter_from', 'refer', 'web_id'
        ]
      }
    },
    {
      id: 'reddit', name: 'Reddit', domains: ['reddit.com', 'redd.it'],
      params: {
        social: [
          'share_id', 'rdt', 'ref_source', 'ref_campaign', 'correlation_id',
          '$deep_link', 'post_index', 'ref', 'post_fullname'
        ]
      }
    },
    {
      id: 'linkedin', name: 'LinkedIn', domains: ['linkedin.com'],
      params: {
        social: [
          'trk', 'trkCampaign', 'trkInfo', 'trkEmail', 'lipi', 'lici', 'midToken',
          'midSig', 'eid', 'otpToken', 'trackingId', 'refId', 'originalSubdomain', 'rcm'
        ]
      }
    },
    {
      id: 'pinterest', name: 'Pinterest', domains: ['pinterest.com', 'pinterest.de', 'pin.it'],
      params: { social: ['invite_code', 'sender', 'sfo', 'mweb_unauth_id'] }
    },
    {
      id: 'spotify', name: 'Spotify', domains: ['spotify.com', 'spotify.link'],
      params: { social: ['si', 'context', 'nd', 'dlsi', 'go', 'sp_cid'] }
    },
    {
      id: 'medium', name: 'Medium', domains: ['medium.com'],
      params: { social: ['source'] }
    },
    {
      id: 'twitch', name: 'Twitch', domains: ['twitch.tv'],
      params: { social: ['tt_medium', 'tt_content', 'tt_campaign'] }
    },
    {
      id: 'amazon', name: 'Amazon', domains: ['amazon.*', 'amzn.to', 'amzn.eu'],
      params: {
        shopping: [
          'ref', 'ref_', 'pf_rd_p', 'pf_rd_r', 'pf_rd_s', 'pf_rd_t', 'pf_rd_i', 'pf_rd_m',
          'pd_rd_w', 'pd_rd_wg', 'pd_rd_r', 'pd_rd_i', 'content-id', '_encoding', 'psc',
          'qid', 'sr', 'sprefix', 'crid', 'dib', 'dib_tag', 'spIA', 'sp_csd', 'spLa',
          'social_share', 'starsLeft', 'skipTwisterOG', 'cv_ct_cx', 'keywords_source',
          'hvadid', 'hvpos', 'hvnetw', 'hvrand', 'hvpone', 'hvptwo', 'hvqmt', 'hvdev',
          'hvdvcmdl', 'hvlocint', 'hvlocphy', 'hvtargid', 'hydadcr', 'ds', 'sbo',
          'ufe', 'ingress', 'visitId', 'plattr', 'adgrpid'
        ],
        affiliate: [
          'tag', 'ascsubtag', 'linkCode', 'linkId', 'camp', 'creative', 'creativeASIN',
          'asc_campaign', 'asc_refurl', 'asc_source'
        ]
      }
    },
    {
      id: 'ebay', name: 'eBay', domains: ['ebay.*'],
      params: {
        shopping: [
          '_trkparms', '_trksid', 'hash', 'amdata', 'mkevt', 'mkcid', 'mkrid', 'toolid',
          '_from', 'itmmeta', 'itmprp', 'ssspo', 'sssrc', 'ssuid', 'widget_ver', 'efpid',
          'norover', 'mkpid', 'emsid', 'osub', 'segname', 'trkid', 'sojTags'
        ],
        affiliate: ['campid', 'customid']
      }
    },
    {
      id: 'aliexpress', name: 'AliExpress', domains: ['aliexpress.*', 'aliexpress.us'],
      params: {
        shopping: [
          'spm', 'scm', 'pvid', 'algo_pvid', 'algo_exp_id', 'btsid', 'ws_ab_test',
          'gatewayAdapt', 'sk', 'terminal_id', 'afSmartRedirect', 'gps-id', 'scm_id',
          'scm-url', 'curPageLogUid', 'utparam-url', 'pdp_npi', 'pdp_ext_f', 'pdp_perf',
          '_randl_currency', '_randl_shipto', 'srcSns', 'spreadType', 'bizType',
          'social_params', 'tt', 'businessType', 'afTraceInfo', 'aff_request_id',
          'invitationCode', 'shareId', 'templateKey', 'pdp_pi', 'aecmd'
        ],
        affiliate: ['aff_platform', 'aff_trace_key', 'aff_fcid', 'aff_fsk', 'aff_short_key']
      }
    },
    {
      id: 'temu', name: 'Temu', domains: ['temu.com'],
      params: {
        shopping: [
          'refer_page_name', 'refer_page_id', 'refer_page_sn', '_x_sessn_id', '_bg_fs',
          '_p_rfs', '_x_vst_scene', '_x_ads_sub_channel', '_x_ads_channel',
          '_x_ads_account', '_x_ads_set', '_x_ads_id', '_x_ads_creative_id',
          '_x_ns_sku_id', '_x_ns_prz_type', '_x_ns_gid', '_x_ns_device', '_x_ns_match_type',
          '_x_ns_query', '_x_gmc_account', '_x_login_type', 'refer_source', '_oak_page_source',
          '_oak_region', 'share_token'
        ]
      }
    },
    {
      id: 'etsy', name: 'Etsy', domains: ['etsy.com'],
      params: {
        shopping: [
          'click_key', 'click_sum', 'ref', 'pro', 'frs', 'ga_order', 'ga_search_type',
          'ga_view_type', 'ga_search_query', 'sts', 'organic_search_click', 'plkey',
          'external', 'pla_spark'
        ]
      }
    },
    {
      id: 'walmart', name: 'Walmart', domains: ['walmart.com'],
      params: {
        shopping: [
          'athbdg', 'athcpid', 'athpgid', 'athznid', 'athieid', 'athstid', 'athguid',
          'athwpid', 'athtvid', 'athancid', 'athena', 'athsdid', 'athmtid', 'adsRedirect',
          'wmlspartner', 'sourceid', 'veh', 'wl13'
        ]
      }
    },
    {
      id: 'booking', name: 'Booking.com', domains: ['booking.com'],
      params: {
        shopping: ['label', 'sid', 'srpvid', 'srepoch', 'hpos', 'hapos', 'sr_order', 'ucfs', 'arphpl'],
        affiliate: ['aid']
      }
    },
    {
      id: 'netflix', name: 'Netflix', domains: ['netflix.com'],
      params: { social: ['trkid', 'tctx'] }
    },
    {
      id: 'zalando', name: 'Zalando', domains: ['zalando.*'],
      params: { shopping: ['wmc', 'opc', 'cmp'] }
    }
  ];

  /*
   * Redirect wrappers: links that hide the real destination inside a parameter.
   * `hosts` match exactly or as a subdomain ("google.*" = any TLD). `path` is a
   * prefix of the pathname. `param` is the query parameter holding the target.
   * `decode` names a special decoder for wrappers that do not use plain
   * percent-encoding.
   */
  const REDIRECTS = [
    { id: 'google', hosts: ['google.*'], path: '/url', param: ['q', 'url'] },
    { id: 'youtube', hosts: ['youtube.com'], path: '/redirect', param: ['q'] },
    { id: 'youtube-attribution', hosts: ['youtube.com'], path: '/attribution_link', param: ['u'], base: 'https://www.youtube.com' },
    { id: 'facebook', hosts: ['l.facebook.com', 'lm.facebook.com', 'l.messenger.com'], path: '/l.php', param: ['u'] },
    { id: 'instagram', hosts: ['l.instagram.com'], path: '/', param: ['u'] },
    { id: 'reddit', hosts: ['out.reddit.com'], path: '/', param: ['url'] },
    { id: 'linkedin', hosts: ['linkedin.com'], path: '/redir/redirect', param: ['url'] },
    { id: 'steam', hosts: ['steamcommunity.com'], path: '/linkfilter', param: ['url', 'u'] },
    { id: 'disqus', hosts: ['disq.us'], path: '/url', param: ['url'], decode: 'disqus' },
    { id: 'slack', hosts: ['slack-redir.net'], path: '/link', param: ['url'] },
    { id: 'gmx', hosts: ['deref-gmx.net', 'deref-gmx.com', 'deref-web.de', 'deref-mail.com', 'deref-1und1.de'], path: '/', param: ['redirectUrl'] },
    { id: 'vk', hosts: ['vk.com', 'away.vk.com'], path: '/away', param: ['to'] },
    { id: 'duckduckgo', hosts: ['duckduckgo.com'], path: '/l/', param: ['uddg'] },
    { id: 'tumblr', hosts: ['t.umblr.com'], path: '/redirect', param: ['z'] },
    { id: 'bing', hosts: ['bing.com'], path: '/ck/a', param: ['u'], decode: 'bing' },
    { id: 'exitsc', hosts: ['exit.sc'], path: '/', param: ['url'] },
    { id: 'pinterest', hosts: ['pinterest.com'], path: '/offsite', param: ['url'] }
  ];

  const api = { CATEGORIES, GLOBAL_PARAMS, SITES, REDIRECTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LinkwashRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
