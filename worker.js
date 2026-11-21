var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// server/cloudflare/d1AuthVersionReader.ts
var D1AuthVersionReader = class {
  constructor(database) {
    this.database = database;
  }
  static {
    __name(this, "D1AuthVersionReader");
  }
  async getAuthVersion(userId) {
    if (!userId || userId.length > 128) throw new Error("Invalid user id");
    const row = await this.database.prepare(
      "SELECT json_extract(record_json, '$.authVersion') AS auth_version FROM app_users WHERE id = ? LIMIT 1"
    ).bind(userId).first();
    if (!row) throw new Error("User not found");
    if (row.auth_version === null) return 0;
    if (!Number.isSafeInteger(row.auth_version) || row.auth_version < 0) {
      throw new Error("Invalid stored authentication version");
    }
    return row.auth_version;
  }
};

// node_modules/bcryptjs/index.js
import nodeCrypto from "crypto";
var randomFallback = null;
function randomBytes(len) {
  try {
    return crypto.getRandomValues(new Uint8Array(len));
  } catch {
  }
  try {
    return nodeCrypto.randomBytes(len);
  } catch {
  }
  if (!randomFallback) {
    throw Error(
      "Neither WebCryptoAPI nor a crypto module is available. Use bcrypt.setRandomFallback to set an alternative"
    );
  }
  return randomFallback(len);
}
__name(randomBytes, "randomBytes");
function setRandomFallback(random) {
  randomFallback = random;
}
__name(setRandomFallback, "setRandomFallback");
function genSaltSync(rounds, seed_length) {
  rounds = rounds || GENSALT_DEFAULT_LOG2_ROUNDS;
  if (typeof rounds !== "number")
    throw Error(
      "Illegal arguments: " + typeof rounds + ", " + typeof seed_length
    );
  if (rounds < 4) rounds = 4;
  else if (rounds > 31) rounds = 31;
  var salt = [];
  salt.push("$2b$");
  if (rounds < 10) salt.push("0");
  salt.push(rounds.toString());
  salt.push("$");
  salt.push(base64_encode(randomBytes(BCRYPT_SALT_LEN), BCRYPT_SALT_LEN));
  return salt.join("");
}
__name(genSaltSync, "genSaltSync");
function genSalt(rounds, seed_length, callback) {
  if (typeof seed_length === "function")
    callback = seed_length, seed_length = void 0;
  if (typeof rounds === "function") callback = rounds, rounds = void 0;
  if (typeof rounds === "undefined") rounds = GENSALT_DEFAULT_LOG2_ROUNDS;
  else if (typeof rounds !== "number")
    throw Error("illegal arguments: " + typeof rounds);
  function _async(callback2) {
    nextTick(function() {
      try {
        callback2(null, genSaltSync(rounds));
      } catch (err) {
        callback2(err);
      }
    });
  }
  __name(_async, "_async");
  if (callback) {
    if (typeof callback !== "function")
      throw Error("Illegal callback: " + typeof callback);
    _async(callback);
  } else
    return new Promise(function(resolve, reject) {
      _async(function(err, res) {
        if (err) {
          reject(err);
          return;
        }
        resolve(res);
      });
    });
}
__name(genSalt, "genSalt");
function hashSync(password, salt) {
  if (typeof salt === "undefined") salt = GENSALT_DEFAULT_LOG2_ROUNDS;
  if (typeof salt === "number") salt = genSaltSync(salt);
  if (typeof password !== "string" || typeof salt !== "string")
    throw Error("Illegal arguments: " + typeof password + ", " + typeof salt);
  return _hash(password, salt);
}
__name(hashSync, "hashSync");
function hash(password, salt, callback, progressCallback) {
  function _async(callback2) {
    if (typeof password === "string" && typeof salt === "number")
      genSalt(salt, function(err, salt2) {
        _hash(password, salt2, callback2, progressCallback);
      });
    else if (typeof password === "string" && typeof salt === "string")
      _hash(password, salt, callback2, progressCallback);
    else
      nextTick(
        callback2.bind(
          this,
          Error("Illegal arguments: " + typeof password + ", " + typeof salt)
        )
      );
  }
  __name(_async, "_async");
  if (callback) {
    if (typeof callback !== "function")
      throw Error("Illegal callback: " + typeof callback);
    _async(callback);
  } else
    return new Promise(function(resolve, reject) {
      _async(function(err, res) {
        if (err) {
          reject(err);
          return;
        }
        resolve(res);
      });
    });
}
__name(hash, "hash");
function safeStringCompare(known, unknown) {
  var diff = known.length ^ unknown.length;
  for (var i = 0; i < known.length; ++i) {
    diff |= known.charCodeAt(i) ^ unknown.charCodeAt(i);
  }
  return diff === 0;
}
__name(safeStringCompare, "safeStringCompare");
function compareSync(password, hash2) {
  if (typeof password !== "string" || typeof hash2 !== "string")
    throw Error("Illegal arguments: " + typeof password + ", " + typeof hash2);
  if (hash2.length !== 60) return false;
  return safeStringCompare(
    hashSync(password, hash2.substring(0, hash2.length - 31)),
    hash2
  );
}
__name(compareSync, "compareSync");
function compare(password, hashValue, callback, progressCallback) {
  function _async(callback2) {
    if (typeof password !== "string" || typeof hashValue !== "string") {
      nextTick(
        callback2.bind(
          this,
          Error(
            "Illegal arguments: " + typeof password + ", " + typeof hashValue
          )
        )
      );
      return;
    }
    if (hashValue.length !== 60) {
      nextTick(callback2.bind(this, null, false));
      return;
    }
    hash(
      password,
      hashValue.substring(0, 29),
      function(err, comp) {
        if (err) callback2(err);
        else callback2(null, safeStringCompare(comp, hashValue));
      },
      progressCallback
    );
  }
  __name(_async, "_async");
  if (callback) {
    if (typeof callback !== "function")
      throw Error("Illegal callback: " + typeof callback);
    _async(callback);
  } else
    return new Promise(function(resolve, reject) {
      _async(function(err, res) {
        if (err) {
          reject(err);
          return;
        }
        resolve(res);
      });
    });
}
__name(compare, "compare");
function getRounds(hash2) {
  if (typeof hash2 !== "string")
    throw Error("Illegal arguments: " + typeof hash2);
  return parseInt(hash2.split("$")[2], 10);
}
__name(getRounds, "getRounds");
function getSalt(hash2) {
  if (typeof hash2 !== "string")
    throw Error("Illegal arguments: " + typeof hash2);
  if (hash2.length !== 60)
    throw Error("Illegal hash length: " + hash2.length + " != 60");
  return hash2.substring(0, 29);
}
__name(getSalt, "getSalt");
function truncates(password) {
  if (typeof password !== "string")
    throw Error("Illegal arguments: " + typeof password);
  return utf8Length(password) > 72;
}
__name(truncates, "truncates");
var nextTick = typeof setImmediate === "function" ? setImmediate : typeof scheduler === "object" && typeof scheduler.postTask === "function" ? scheduler.postTask.bind(scheduler) : setTimeout;
function utf8Length(string) {
  var len = 0, c = 0;
  for (var i = 0; i < string.length; ++i) {
    c = string.charCodeAt(i);
    if (c < 128) len += 1;
    else if (c < 2048) len += 2;
    else if ((c & 64512) === 55296 && (string.charCodeAt(i + 1) & 64512) === 56320) {
      ++i;
      len += 4;
    } else len += 3;
  }
  return len;
}
__name(utf8Length, "utf8Length");
function utf8Array(string) {
  var offset = 0, c1, c2;
  var buffer = new Array(utf8Length(string));
  for (var i = 0, k = string.length; i < k; ++i) {
    c1 = string.charCodeAt(i);
    if (c1 < 128) {
      buffer[offset++] = c1;
    } else if (c1 < 2048) {
      buffer[offset++] = c1 >> 6 | 192;
      buffer[offset++] = c1 & 63 | 128;
    } else if ((c1 & 64512) === 55296 && ((c2 = string.charCodeAt(i + 1)) & 64512) === 56320) {
      c1 = 65536 + ((c1 & 1023) << 10) + (c2 & 1023);
      ++i;
      buffer[offset++] = c1 >> 18 | 240;
      buffer[offset++] = c1 >> 12 & 63 | 128;
      buffer[offset++] = c1 >> 6 & 63 | 128;
      buffer[offset++] = c1 & 63 | 128;
    } else {
      buffer[offset++] = c1 >> 12 | 224;
      buffer[offset++] = c1 >> 6 & 63 | 128;
      buffer[offset++] = c1 & 63 | 128;
    }
  }
  return buffer;
}
__name(utf8Array, "utf8Array");
var BASE64_CODE = "./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".split("");
var BASE64_INDEX = [
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  0,
  1,
  54,
  55,
  56,
  57,
  58,
  59,
  60,
  61,
  62,
  63,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  14,
  15,
  16,
  17,
  18,
  19,
  20,
  21,
  22,
  23,
  24,
  25,
  26,
  27,
  -1,
  -1,
  -1,
  -1,
  -1,
  -1,
  28,
  29,
  30,
  31,
  32,
  33,
  34,
  35,
  36,
  37,
  38,
  39,
  40,
  41,
  42,
  43,
  44,
  45,
  46,
  47,
  48,
  49,
  50,
  51,
  52,
  53,
  -1,
  -1,
  -1,
  -1,
  -1
];
function base64_encode(b, len) {
  var off = 0, rs = [], c1, c2;
  if (len <= 0 || len > b.length) throw Error("Illegal len: " + len);
  while (off < len) {
    c1 = b[off++] & 255;
    rs.push(BASE64_CODE[c1 >> 2 & 63]);
    c1 = (c1 & 3) << 4;
    if (off >= len) {
      rs.push(BASE64_CODE[c1 & 63]);
      break;
    }
    c2 = b[off++] & 255;
    c1 |= c2 >> 4 & 15;
    rs.push(BASE64_CODE[c1 & 63]);
    c1 = (c2 & 15) << 2;
    if (off >= len) {
      rs.push(BASE64_CODE[c1 & 63]);
      break;
    }
    c2 = b[off++] & 255;
    c1 |= c2 >> 6 & 3;
    rs.push(BASE64_CODE[c1 & 63]);
    rs.push(BASE64_CODE[c2 & 63]);
  }
  return rs.join("");
}
__name(base64_encode, "base64_encode");
function base64_decode(s, len) {
  var off = 0, slen = s.length, olen = 0, rs = [], c1, c2, c3, c4, o, code;
  if (len <= 0) throw Error("Illegal len: " + len);
  while (off < slen - 1 && olen < len) {
    code = s.charCodeAt(off++);
    c1 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
    code = s.charCodeAt(off++);
    c2 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
    if (c1 == -1 || c2 == -1) break;
    o = c1 << 2 >>> 0;
    o |= (c2 & 48) >> 4;
    rs.push(String.fromCharCode(o));
    if (++olen >= len || off >= slen) break;
    code = s.charCodeAt(off++);
    c3 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
    if (c3 == -1) break;
    o = (c2 & 15) << 4 >>> 0;
    o |= (c3 & 60) >> 2;
    rs.push(String.fromCharCode(o));
    if (++olen >= len || off >= slen) break;
    code = s.charCodeAt(off++);
    c4 = code < BASE64_INDEX.length ? BASE64_INDEX[code] : -1;
    o = (c3 & 3) << 6 >>> 0;
    o |= c4;
    rs.push(String.fromCharCode(o));
    ++olen;
  }
  var res = [];
  for (off = 0; off < olen; off++) res.push(rs[off].charCodeAt(0));
  return res;
}
__name(base64_decode, "base64_decode");
var BCRYPT_SALT_LEN = 16;
var GENSALT_DEFAULT_LOG2_ROUNDS = 10;
var BLOWFISH_NUM_ROUNDS = 16;
var MAX_EXECUTION_TIME = 100;
var P_ORIG = [
  608135816,
  2242054355,
  320440878,
  57701188,
  2752067618,
  698298832,
  137296536,
  3964562569,
  1160258022,
  953160567,
  3193202383,
  887688300,
  3232508343,
  3380367581,
  1065670069,
  3041331479,
  2450970073,
  2306472731
];
var S_ORIG = [
  3509652390,
  2564797868,
  805139163,
  3491422135,
  3101798381,
  1780907670,
  3128725573,
  4046225305,
  614570311,
  3012652279,
  134345442,
  2240740374,
  1667834072,
  1901547113,
  2757295779,
  4103290238,
  227898511,
  1921955416,
  1904987480,
  2182433518,
  2069144605,
  3260701109,
  2620446009,
  720527379,
  3318853667,
  677414384,
  3393288472,
  3101374703,
  2390351024,
  1614419982,
  1822297739,
  2954791486,
  3608508353,
  3174124327,
  2024746970,
  1432378464,
  3864339955,
  2857741204,
  1464375394,
  1676153920,
  1439316330,
  715854006,
  3033291828,
  289532110,
  2706671279,
  2087905683,
  3018724369,
  1668267050,
  732546397,
  1947742710,
  3462151702,
  2609353502,
  2950085171,
  1814351708,
  2050118529,
  680887927,
  999245976,
  1800124847,
  3300911131,
  1713906067,
  1641548236,
  4213287313,
  1216130144,
  1575780402,
  4018429277,
  3917837745,
  3693486850,
  3949271944,
  596196993,
  3549867205,
  258830323,
  2213823033,
  772490370,
  2760122372,
  1774776394,
  2652871518,
  566650946,
  4142492826,
  1728879713,
  2882767088,
  1783734482,
  3629395816,
  2517608232,
  2874225571,
  1861159788,
  326777828,
  3124490320,
  2130389656,
  2716951837,
  967770486,
  1724537150,
  2185432712,
  2364442137,
  1164943284,
  2105845187,
  998989502,
  3765401048,
  2244026483,
  1075463327,
  1455516326,
  1322494562,
  910128902,
  469688178,
  1117454909,
  936433444,
  3490320968,
  3675253459,
  1240580251,
  122909385,
  2157517691,
  634681816,
  4142456567,
  3825094682,
  3061402683,
  2540495037,
  79693498,
  3249098678,
  1084186820,
  1583128258,
  426386531,
  1761308591,
  1047286709,
  322548459,
  995290223,
  1845252383,
  2603652396,
  3431023940,
  2942221577,
  3202600964,
  3727903485,
  1712269319,
  422464435,
  3234572375,
  1170764815,
  3523960633,
  3117677531,
  1434042557,
  442511882,
  3600875718,
  1076654713,
  1738483198,
  4213154764,
  2393238008,
  3677496056,
  1014306527,
  4251020053,
  793779912,
  2902807211,
  842905082,
  4246964064,
  1395751752,
  1040244610,
  2656851899,
  3396308128,
  445077038,
  3742853595,
  3577915638,
  679411651,
  2892444358,
  2354009459,
  1767581616,
  3150600392,
  3791627101,
  3102740896,
  284835224,
  4246832056,
  1258075500,
  768725851,
  2589189241,
  3069724005,
  3532540348,
  1274779536,
  3789419226,
  2764799539,
  1660621633,
  3471099624,
  4011903706,
  913787905,
  3497959166,
  737222580,
  2514213453,
  2928710040,
  3937242737,
  1804850592,
  3499020752,
  2949064160,
  2386320175,
  2390070455,
  2415321851,
  4061277028,
  2290661394,
  2416832540,
  1336762016,
  1754252060,
  3520065937,
  3014181293,
  791618072,
  3188594551,
  3933548030,
  2332172193,
  3852520463,
  3043980520,
  413987798,
  3465142937,
  3030929376,
  4245938359,
  2093235073,
  3534596313,
  375366246,
  2157278981,
  2479649556,
  555357303,
  3870105701,
  2008414854,
  3344188149,
  4221384143,
  3956125452,
  2067696032,
  3594591187,
  2921233993,
  2428461,
  544322398,
  577241275,
  1471733935,
  610547355,
  4027169054,
  1432588573,
  1507829418,
  2025931657,
  3646575487,
  545086370,
  48609733,
  2200306550,
  1653985193,
  298326376,
  1316178497,
  3007786442,
  2064951626,
  458293330,
  2589141269,
  3591329599,
  3164325604,
  727753846,
  2179363840,
  146436021,
  1461446943,
  4069977195,
  705550613,
  3059967265,
  3887724982,
  4281599278,
  3313849956,
  1404054877,
  2845806497,
  146425753,
  1854211946,
  1266315497,
  3048417604,
  3681880366,
  3289982499,
  290971e4,
  1235738493,
  2632868024,
  2414719590,
  3970600049,
  1771706367,
  1449415276,
  3266420449,
  422970021,
  1963543593,
  2690192192,
  3826793022,
  1062508698,
  1531092325,
  1804592342,
  2583117782,
  2714934279,
  4024971509,
  1294809318,
  4028980673,
  1289560198,
  2221992742,
  1669523910,
  35572830,
  157838143,
  1052438473,
  1016535060,
  1802137761,
  1753167236,
  1386275462,
  3080475397,
  2857371447,
  1040679964,
  2145300060,
  2390574316,
  1461121720,
  2956646967,
  4031777805,
  4028374788,
  33600511,
  2920084762,
  1018524850,
  629373528,
  3691585981,
  3515945977,
  2091462646,
  2486323059,
  586499841,
  988145025,
  935516892,
  3367335476,
  2599673255,
  2839830854,
  265290510,
  3972581182,
  2759138881,
  3795373465,
  1005194799,
  847297441,
  406762289,
  1314163512,
  1332590856,
  1866599683,
  4127851711,
  750260880,
  613907577,
  1450815602,
  3165620655,
  3734664991,
  3650291728,
  3012275730,
  3704569646,
  1427272223,
  778793252,
  1343938022,
  2676280711,
  2052605720,
  1946737175,
  3164576444,
  3914038668,
  3967478842,
  3682934266,
  1661551462,
  3294938066,
  4011595847,
  840292616,
  3712170807,
  616741398,
  312560963,
  711312465,
  1351876610,
  322626781,
  1910503582,
  271666773,
  2175563734,
  1594956187,
  70604529,
  3617834859,
  1007753275,
  1495573769,
  4069517037,
  2549218298,
  2663038764,
  504708206,
  2263041392,
  3941167025,
  2249088522,
  1514023603,
  1998579484,
  1312622330,
  694541497,
  2582060303,
  2151582166,
  1382467621,
  776784248,
  2618340202,
  3323268794,
  2497899128,
  2784771155,
  503983604,
  4076293799,
  907881277,
  423175695,
  432175456,
  1378068232,
  4145222326,
  3954048622,
  3938656102,
  3820766613,
  2793130115,
  2977904593,
  26017576,
  3274890735,
  3194772133,
  1700274565,
  1756076034,
  4006520079,
  3677328699,
  720338349,
  1533947780,
  354530856,
  688349552,
  3973924725,
  1637815568,
  332179504,
  3949051286,
  53804574,
  2852348879,
  3044236432,
  1282449977,
  3583942155,
  3416972820,
  4006381244,
  1617046695,
  2628476075,
  3002303598,
  1686838959,
  431878346,
  2686675385,
  1700445008,
  1080580658,
  1009431731,
  832498133,
  3223435511,
  2605976345,
  2271191193,
  2516031870,
  1648197032,
  4164389018,
  2548247927,
  300782431,
  375919233,
  238389289,
  3353747414,
  2531188641,
  2019080857,
  1475708069,
  455242339,
  2609103871,
  448939670,
  3451063019,
  1395535956,
  2413381860,
  1841049896,
  1491858159,
  885456874,
  4264095073,
  4001119347,
  1565136089,
  3898914787,
  1108368660,
  540939232,
  1173283510,
  2745871338,
  3681308437,
  4207628240,
  3343053890,
  4016749493,
  1699691293,
  1103962373,
  3625875870,
  2256883143,
  3830138730,
  1031889488,
  3479347698,
  1535977030,
  4236805024,
  3251091107,
  2132092099,
  1774941330,
  1199868427,
  1452454533,
  157007616,
  2904115357,
  342012276,
  595725824,
  1480756522,
  206960106,
  497939518,
  591360097,
  863170706,
  2375253569,
  3596610801,
  1814182875,
  2094937945,
  3421402208,
  1082520231,
  3463918190,
  2785509508,
  435703966,
  3908032597,
  1641649973,
  2842273706,
  3305899714,
  1510255612,
  2148256476,
  2655287854,
  3276092548,
  4258621189,
  236887753,
  3681803219,
  274041037,
  1734335097,
  3815195456,
  3317970021,
  1899903192,
  1026095262,
  4050517792,
  356393447,
  2410691914,
  3873677099,
  3682840055,
  3913112168,
  2491498743,
  4132185628,
  2489919796,
  1091903735,
  1979897079,
  3170134830,
  3567386728,
  3557303409,
  857797738,
  1136121015,
  1342202287,
  507115054,
  2535736646,
  337727348,
  3213592640,
  1301675037,
  2528481711,
  1895095763,
  1721773893,
  3216771564,
  62756741,
  2142006736,
  835421444,
  2531993523,
  1442658625,
  3659876326,
  2882144922,
  676362277,
  1392781812,
  170690266,
  3921047035,
  1759253602,
  3611846912,
  1745797284,
  664899054,
  1329594018,
  3901205900,
  3045908486,
  2062866102,
  2865634940,
  3543621612,
  3464012697,
  1080764994,
  553557557,
  3656615353,
  3996768171,
  991055499,
  499776247,
  1265440854,
  648242737,
  3940784050,
  980351604,
  3713745714,
  1749149687,
  3396870395,
  4211799374,
  3640570775,
  1161844396,
  3125318951,
  1431517754,
  545492359,
  4268468663,
  3499529547,
  1437099964,
  2702547544,
  3433638243,
  2581715763,
  2787789398,
  1060185593,
  1593081372,
  2418618748,
  4260947970,
  69676912,
  2159744348,
  86519011,
  2512459080,
  3838209314,
  1220612927,
  3339683548,
  133810670,
  1090789135,
  1078426020,
  1569222167,
  845107691,
  3583754449,
  4072456591,
  1091646820,
  628848692,
  1613405280,
  3757631651,
  526609435,
  236106946,
  48312990,
  2942717905,
  3402727701,
  1797494240,
  859738849,
  992217954,
  4005476642,
  2243076622,
  3870952857,
  3732016268,
  765654824,
  3490871365,
  2511836413,
  1685915746,
  3888969200,
  1414112111,
  2273134842,
  3281911079,
  4080962846,
  172450625,
  2569994100,
  980381355,
  4109958455,
  2819808352,
  2716589560,
  2568741196,
  3681446669,
  3329971472,
  1835478071,
  660984891,
  3704678404,
  4045999559,
  3422617507,
  3040415634,
  1762651403,
  1719377915,
  3470491036,
  2693910283,
  3642056355,
  3138596744,
  1364962596,
  2073328063,
  1983633131,
  926494387,
  3423689081,
  2150032023,
  4096667949,
  1749200295,
  3328846651,
  309677260,
  2016342300,
  1779581495,
  3079819751,
  111262694,
  1274766160,
  443224088,
  298511866,
  1025883608,
  3806446537,
  1145181785,
  168956806,
  3641502830,
  3584813610,
  1689216846,
  3666258015,
  3200248200,
  1692713982,
  2646376535,
  4042768518,
  1618508792,
  1610833997,
  3523052358,
  4130873264,
  2001055236,
  3610705100,
  2202168115,
  4028541809,
  2961195399,
  1006657119,
  2006996926,
  3186142756,
  1430667929,
  3210227297,
  1314452623,
  4074634658,
  4101304120,
  2273951170,
  1399257539,
  3367210612,
  3027628629,
  1190975929,
  2062231137,
  2333990788,
  2221543033,
  2438960610,
  1181637006,
  548689776,
  2362791313,
  3372408396,
  3104550113,
  3145860560,
  296247880,
  1970579870,
  3078560182,
  3769228297,
  1714227617,
  3291629107,
  3898220290,
  166772364,
  1251581989,
  493813264,
  448347421,
  195405023,
  2709975567,
  677966185,
  3703036547,
  1463355134,
  2715995803,
  1338867538,
  1343315457,
  2802222074,
  2684532164,
  233230375,
  2599980071,
  2000651841,
  3277868038,
  1638401717,
  4028070440,
  3237316320,
  6314154,
  819756386,
  300326615,
  590932579,
  1405279636,
  3267499572,
  3150704214,
  2428286686,
  3959192993,
  3461946742,
  1862657033,
  1266418056,
  963775037,
  2089974820,
  2263052895,
  1917689273,
  448879540,
  3550394620,
  3981727096,
  150775221,
  3627908307,
  1303187396,
  508620638,
  2975983352,
  2726630617,
  1817252668,
  1876281319,
  1457606340,
  908771278,
  3720792119,
  3617206836,
  2455994898,
  1729034894,
  1080033504,
  976866871,
  3556439503,
  2881648439,
  1522871579,
  1555064734,
  1336096578,
  3548522304,
  2579274686,
  3574697629,
  3205460757,
  3593280638,
  3338716283,
  3079412587,
  564236357,
  2993598910,
  1781952180,
  1464380207,
  3163844217,
  3332601554,
  1699332808,
  1393555694,
  1183702653,
  3581086237,
  1288719814,
  691649499,
  2847557200,
  2895455976,
  3193889540,
  2717570544,
  1781354906,
  1676643554,
  2592534050,
  3230253752,
  1126444790,
  2770207658,
  2633158820,
  2210423226,
  2615765581,
  2414155088,
  3127139286,
  673620729,
  2805611233,
  1269405062,
  4015350505,
  3341807571,
  4149409754,
  1057255273,
  2012875353,
  2162469141,
  2276492801,
  2601117357,
  993977747,
  3918593370,
  2654263191,
  753973209,
  36408145,
  2530585658,
  25011837,
  3520020182,
  2088578344,
  530523599,
  2918365339,
  1524020338,
  1518925132,
  3760827505,
  3759777254,
  1202760957,
  3985898139,
  3906192525,
  674977740,
  4174734889,
  2031300136,
  2019492241,
  3983892565,
  4153806404,
  3822280332,
  352677332,
  2297720250,
  60907813,
  90501309,
  3286998549,
  1016092578,
  2535922412,
  2839152426,
  457141659,
  509813237,
  4120667899,
  652014361,
  1966332200,
  2975202805,
  55981186,
  2327461051,
  676427537,
  3255491064,
  2882294119,
  3433927263,
  1307055953,
  942726286,
  933058658,
  2468411793,
  3933900994,
  4215176142,
  1361170020,
  2001714738,
  2830558078,
  3274259782,
  1222529897,
  1679025792,
  2729314320,
  3714953764,
  1770335741,
  151462246,
  3013232138,
  1682292957,
  1483529935,
  471910574,
  1539241949,
  458788160,
  3436315007,
  1807016891,
  3718408830,
  978976581,
  1043663428,
  3165965781,
  1927990952,
  4200891579,
  2372276910,
  3208408903,
  3533431907,
  1412390302,
  2931980059,
  4132332400,
  1947078029,
  3881505623,
  4168226417,
  2941484381,
  1077988104,
  1320477388,
  886195818,
  18198404,
  3786409e3,
  2509781533,
  112762804,
  3463356488,
  1866414978,
  891333506,
  18488651,
  661792760,
  1628790961,
  3885187036,
  3141171499,
  876946877,
  2693282273,
  1372485963,
  791857591,
  2686433993,
  3759982718,
  3167212022,
  3472953795,
  2716379847,
  445679433,
  3561995674,
  3504004811,
  3574258232,
  54117162,
  3331405415,
  2381918588,
  3769707343,
  4154350007,
  1140177722,
  4074052095,
  668550556,
  3214352940,
  367459370,
  261225585,
  2610173221,
  4209349473,
  3468074219,
  3265815641,
  314222801,
  3066103646,
  3808782860,
  282218597,
  3406013506,
  3773591054,
  379116347,
  1285071038,
  846784868,
  2669647154,
  3771962079,
  3550491691,
  2305946142,
  453669953,
  1268987020,
  3317592352,
  3279303384,
  3744833421,
  2610507566,
  3859509063,
  266596637,
  3847019092,
  517658769,
  3462560207,
  3443424879,
  370717030,
  4247526661,
  2224018117,
  4143653529,
  4112773975,
  2788324899,
  2477274417,
  1456262402,
  2901442914,
  1517677493,
  1846949527,
  2295493580,
  3734397586,
  2176403920,
  1280348187,
  1908823572,
  3871786941,
  846861322,
  1172426758,
  3287448474,
  3383383037,
  1655181056,
  3139813346,
  901632758,
  1897031941,
  2986607138,
  3066810236,
  3447102507,
  1393639104,
  373351379,
  950779232,
  625454576,
  3124240540,
  4148612726,
  2007998917,
  544563296,
  2244738638,
  2330496472,
  2058025392,
  1291430526,
  424198748,
  50039436,
  29584100,
  3605783033,
  2429876329,
  2791104160,
  1057563949,
  3255363231,
  3075367218,
  3463963227,
  1469046755,
  985887462
];
var C_ORIG = [
  1332899944,
  1700884034,
  1701343084,
  1684370003,
  1668446532,
  1869963892
];
function _encipher(lr, off, P, S) {
  var n, l = lr[off], r = lr[off + 1];
  l ^= P[0];
  n = S[l >>> 24];
  n += S[256 | l >> 16 & 255];
  n ^= S[512 | l >> 8 & 255];
  n += S[768 | l & 255];
  r ^= n ^ P[1];
  n = S[r >>> 24];
  n += S[256 | r >> 16 & 255];
  n ^= S[512 | r >> 8 & 255];
  n += S[768 | r & 255];
  l ^= n ^ P[2];
  n = S[l >>> 24];
  n += S[256 | l >> 16 & 255];
  n ^= S[512 | l >> 8 & 255];
  n += S[768 | l & 255];
  r ^= n ^ P[3];
  n = S[r >>> 24];
  n += S[256 | r >> 16 & 255];
  n ^= S[512 | r >> 8 & 255];
  n += S[768 | r & 255];
  l ^= n ^ P[4];
  n = S[l >>> 24];
  n += S[256 | l >> 16 & 255];
  n ^= S[512 | l >> 8 & 255];
  n += S[768 | l & 255];
  r ^= n ^ P[5];
  n = S[r >>> 24];
  n += S[256 | r >> 16 & 255];
  n ^= S[512 | r >> 8 & 255];
  n += S[768 | r & 255];
  l ^= n ^ P[6];
  n = S[l >>> 24];
  n += S[256 | l >> 16 & 255];
  n ^= S[512 | l >> 8 & 255];
  n += S[768 | l & 255];
  r ^= n ^ P[7];
  n = S[r >>> 24];
  n += S[256 | r >> 16 & 255];
  n ^= S[512 | r >> 8 & 255];
  n += S[768 | r & 255];
  l ^= n ^ P[8];
  n = S[l >>> 24];
  n += S[256 | l >> 16 & 255];
  n ^= S[512 | l >> 8 & 255];
  n += S[768 | l & 255];
  r ^= n ^ P[9];
  n = S[r >>> 24];
  n += S[256 | r >> 16 & 255];
  n ^= S[512 | r >> 8 & 255];
  n += S[768 | r & 255];
  l ^= n ^ P[10];
  n = S[l >>> 24];
  n += S[256 | l >> 16 & 255];
  n ^= S[512 | l >> 8 & 255];
  n += S[768 | l & 255];
  r ^= n ^ P[11];
  n = S[r >>> 24];
  n += S[256 | r >> 16 & 255];
  n ^= S[512 | r >> 8 & 255];
  n += S[768 | r & 255];
  l ^= n ^ P[12];
  n = S[l >>> 24];
  n += S[256 | l >> 16 & 255];
  n ^= S[512 | l >> 8 & 255];
  n += S[768 | l & 255];
  r ^= n ^ P[13];
  n = S[r >>> 24];
  n += S[256 | r >> 16 & 255];
  n ^= S[512 | r >> 8 & 255];
  n += S[768 | r & 255];
  l ^= n ^ P[14];
  n = S[l >>> 24];
  n += S[256 | l >> 16 & 255];
  n ^= S[512 | l >> 8 & 255];
  n += S[768 | l & 255];
  r ^= n ^ P[15];
  n = S[r >>> 24];
  n += S[256 | r >> 16 & 255];
  n ^= S[512 | r >> 8 & 255];
  n += S[768 | r & 255];
  l ^= n ^ P[16];
  lr[off] = r ^ P[BLOWFISH_NUM_ROUNDS + 1];
  lr[off + 1] = l;
  return lr;
}
__name(_encipher, "_encipher");
function _streamtoword(data, offp) {
  for (var i = 0, word = 0; i < 4; ++i)
    word = word << 8 | data[offp] & 255, offp = (offp + 1) % data.length;
  return { key: word, offp };
}
__name(_streamtoword, "_streamtoword");
function _key(key, P, S) {
  var offset = 0, lr = [0, 0], plen = P.length, slen = S.length, sw;
  for (var i = 0; i < plen; i++)
    sw = _streamtoword(key, offset), offset = sw.offp, P[i] = P[i] ^ sw.key;
  for (i = 0; i < plen; i += 2)
    lr = _encipher(lr, 0, P, S), P[i] = lr[0], P[i + 1] = lr[1];
  for (i = 0; i < slen; i += 2)
    lr = _encipher(lr, 0, P, S), S[i] = lr[0], S[i + 1] = lr[1];
}
__name(_key, "_key");
function _ekskey(data, key, P, S) {
  var offp = 0, lr = [0, 0], plen = P.length, slen = S.length, sw;
  for (var i = 0; i < plen; i++)
    sw = _streamtoword(key, offp), offp = sw.offp, P[i] = P[i] ^ sw.key;
  offp = 0;
  for (i = 0; i < plen; i += 2)
    sw = _streamtoword(data, offp), offp = sw.offp, lr[0] ^= sw.key, sw = _streamtoword(data, offp), offp = sw.offp, lr[1] ^= sw.key, lr = _encipher(lr, 0, P, S), P[i] = lr[0], P[i + 1] = lr[1];
  for (i = 0; i < slen; i += 2)
    sw = _streamtoword(data, offp), offp = sw.offp, lr[0] ^= sw.key, sw = _streamtoword(data, offp), offp = sw.offp, lr[1] ^= sw.key, lr = _encipher(lr, 0, P, S), S[i] = lr[0], S[i + 1] = lr[1];
}
__name(_ekskey, "_ekskey");
function _crypt(b, salt, rounds, callback, progressCallback) {
  var cdata = C_ORIG.slice(), clen = cdata.length, err;
  if (rounds < 4 || rounds > 31) {
    err = Error("Illegal number of rounds (4-31): " + rounds);
    if (callback) {
      nextTick(callback.bind(this, err));
      return;
    } else throw err;
  }
  if (salt.length !== BCRYPT_SALT_LEN) {
    err = Error(
      "Illegal salt length: " + salt.length + " != " + BCRYPT_SALT_LEN
    );
    if (callback) {
      nextTick(callback.bind(this, err));
      return;
    } else throw err;
  }
  rounds = 1 << rounds >>> 0;
  var P, S, i = 0, j;
  if (typeof Int32Array === "function") {
    P = new Int32Array(P_ORIG);
    S = new Int32Array(S_ORIG);
  } else {
    P = P_ORIG.slice();
    S = S_ORIG.slice();
  }
  _ekskey(salt, b, P, S);
  function next() {
    if (progressCallback) progressCallback(i / rounds);
    if (i < rounds) {
      var start = Date.now();
      for (; i < rounds; ) {
        i = i + 1;
        _key(b, P, S);
        _key(salt, P, S);
        if (Date.now() - start > MAX_EXECUTION_TIME) break;
      }
    } else {
      for (i = 0; i < 64; i++)
        for (j = 0; j < clen >> 1; j++) _encipher(cdata, j << 1, P, S);
      var ret = [];
      for (i = 0; i < clen; i++)
        ret.push((cdata[i] >> 24 & 255) >>> 0), ret.push((cdata[i] >> 16 & 255) >>> 0), ret.push((cdata[i] >> 8 & 255) >>> 0), ret.push((cdata[i] & 255) >>> 0);
      if (callback) {
        callback(null, ret);
        return;
      } else return ret;
    }
    if (callback) nextTick(next);
  }
  __name(next, "next");
  if (typeof callback !== "undefined") {
    next();
  } else {
    var res;
    while (true) if (typeof (res = next()) !== "undefined") return res || [];
  }
}
__name(_crypt, "_crypt");
function _hash(password, salt, callback, progressCallback) {
  var err;
  if (typeof password !== "string" || typeof salt !== "string") {
    err = Error("Invalid string / salt: Not a string");
    if (callback) {
      nextTick(callback.bind(this, err));
      return;
    } else throw err;
  }
  var minor, offset;
  if (salt.charAt(0) !== "$" || salt.charAt(1) !== "2") {
    err = Error("Invalid salt version: " + salt.substring(0, 2));
    if (callback) {
      nextTick(callback.bind(this, err));
      return;
    } else throw err;
  }
  if (salt.charAt(2) === "$") minor = String.fromCharCode(0), offset = 3;
  else {
    minor = salt.charAt(2);
    if (minor !== "a" && minor !== "b" && minor !== "y" || salt.charAt(3) !== "$") {
      err = Error("Invalid salt revision: " + salt.substring(2, 4));
      if (callback) {
        nextTick(callback.bind(this, err));
        return;
      } else throw err;
    }
    offset = 4;
  }
  if (salt.charAt(offset + 2) > "$") {
    err = Error("Missing salt rounds");
    if (callback) {
      nextTick(callback.bind(this, err));
      return;
    } else throw err;
  }
  var r1 = parseInt(salt.substring(offset, offset + 1), 10) * 10, r2 = parseInt(salt.substring(offset + 1, offset + 2), 10), rounds = r1 + r2, real_salt = salt.substring(offset + 3, offset + 25);
  password += minor >= "a" ? "\0" : "";
  var passwordb = utf8Array(password), saltb = base64_decode(real_salt, BCRYPT_SALT_LEN);
  function finish(bytes) {
    var res = [];
    res.push("$2");
    if (minor >= "a") res.push(minor);
    res.push("$");
    if (rounds < 10) res.push("0");
    res.push(rounds.toString());
    res.push("$");
    res.push(base64_encode(saltb, saltb.length));
    res.push(base64_encode(bytes, C_ORIG.length * 4 - 1));
    return res.join("");
  }
  __name(finish, "finish");
  if (typeof callback == "undefined")
    return finish(_crypt(passwordb, saltb, rounds));
  else {
    _crypt(
      passwordb,
      saltb,
      rounds,
      function(err2, bytes) {
        if (err2) callback(err2, null);
        else callback(null, finish(bytes));
      },
      progressCallback
    );
  }
}
__name(_hash, "_hash");
function encodeBase64(bytes, length) {
  return base64_encode(bytes, length);
}
__name(encodeBase64, "encodeBase64");
function decodeBase64(string, length) {
  return base64_decode(string, length);
}
__name(decodeBase64, "decodeBase64");
var bcryptjs_default = {
  setRandomFallback,
  genSaltSync,
  genSalt,
  hashSync,
  hash,
  compareSync,
  compare,
  getRounds,
  getSalt,
  truncates,
  encodeBase64,
  decodeBase64
};

// server/cloudflare/d1UserRepository.ts
function parseStoredUser(raw) {
  if (typeof raw !== "string") throw new Error("Stored user JSON is missing");
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Stored user JSON is invalid");
  }
  if (!value || typeof value !== "object" || typeof value.id !== "string" || typeof value.username !== "string" || typeof value.role !== "string" || typeof value.status !== "string") {
    throw new Error("Stored user record is malformed");
  }
  return value;
}
__name(parseStoredUser, "parseStoredUser");
function toPublicUser(user) {
  const { passwordHash: _passwordHash, authVersion: _authVersion, ...safe } = user;
  return safe;
}
__name(toPublicUser, "toPublicUser");
var D1UserRepository = class {
  constructor(database) {
    this.database = database;
  }
  static {
    __name(this, "D1UserRepository");
  }
  async findPublicById(userId) {
    if (!userId || userId.length > 128) throw new Error("Invalid user id");
    const row = await this.database.prepare("SELECT record_json FROM app_users WHERE id = ? LIMIT 1").bind(userId).first();
    return row ? toPublicUser(parseStoredUser(row.record_json)) : null;
  }
  async findForLoginByUsername(username) {
    const clean = typeof username === "string" ? username.trim() : "";
    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(clean)) return null;
    const row = await this.database.prepare("SELECT record_json FROM app_users WHERE username = ? COLLATE NOCASE LIMIT 1").bind(clean).first();
    if (!row) return null;
    const user = parseStoredUser(row.record_json);
    if (typeof user.passwordHash !== "string" || user.passwordHash.length < 20) {
      throw new Error("Stored user credential is malformed");
    }
    return user;
  }
  async setPasswordHash(userId, passwordHash, timestamp = (/* @__PURE__ */ new Date()).toISOString()) {
    if (!userId || userId.length > 128) throw new Error("Invalid user id");
    if (typeof passwordHash !== "string" || passwordHash.length < 20 || passwordHash.length > 256) {
      throw new Error("Invalid password hash");
    }
    const result = await this.database.prepare(
      "UPDATE app_users SET record_json = json_set(record_json, '$.passwordHash', ?, '$.authVersion', COALESCE(json_extract(record_json, '$.authVersion'), 0) + 1), updated_at = ? WHERE id = ?"
    ).bind(passwordHash, timestamp, userId).run();
    if (!result.success) throw new Error("Failed to update user password");
    return Number(result.meta?.changes || 0) > 0;
  }
  async recordLoginSuccess(userId, timestamp = (/* @__PURE__ */ new Date()).toISOString()) {
    if (!userId || userId.length > 128) throw new Error("Invalid user id");
    const result = await this.database.prepare(
      "UPDATE app_users SET record_json = json_set(record_json, '$.failedLoginAttempts', 0, '$.lockedUntil', NULL, '$.lastLoginAt', ?, '$.lastActivityAt', ?), updated_at = ? WHERE id = ?"
    ).bind(timestamp, timestamp, timestamp, userId).run();
    if (!result.success) throw new Error("Failed to record login success");
    return Number(result.meta?.changes || 0) > 0;
  }
  async recordLoginFailure(userId, maxAttempts = 5, lockDurationMs = 15 * 60 * 1e3, now = /* @__PURE__ */ new Date()) {
    if (!userId || userId.length > 128) throw new Error("Invalid user id");
    if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) {
      throw new Error("Invalid maximum login attempts");
    }
    if (!Number.isSafeInteger(lockDurationMs) || lockDurationMs < 1e3 || lockDurationMs > 24 * 60 * 60 * 1e3) {
      throw new Error("Invalid login lock duration");
    }
    const nowIso = now.toISOString();
    const lockedUntil = new Date(now.getTime() + lockDurationMs).toISOString();
    const result = await this.database.prepare(
      "UPDATE app_users SET record_json = json_set(record_json, '$.failedLoginAttempts', COALESCE(json_extract(record_json, '$.failedLoginAttempts'), 0) + 1, '$.lockedUntil', CASE WHEN COALESCE(json_extract(record_json, '$.failedLoginAttempts'), 0) + 1 >= ? THEN ? ELSE json_extract(record_json, '$.lockedUntil') END), updated_at = ? WHERE id = ?"
    ).bind(maxAttempts, lockedUntil, nowIso, userId).run();
    if (!result.success) throw new Error("Failed to record login failure");
    if (Number(result.meta?.changes || 0) === 0) return { found: false, failedAttempts: 0, lockedUntil: null };
    const row = await this.database.prepare("SELECT json_extract(record_json, '$.failedLoginAttempts') AS failed_attempts, json_extract(record_json, '$.lockedUntil') AS locked_until FROM app_users WHERE id = ? LIMIT 1").bind(userId).first();
    if (!row) return { found: false, failedAttempts: 0, lockedUntil: null };
    return {
      found: true,
      failedAttempts: Number(row.failed_attempts || 0),
      lockedUntil: row.locked_until || null
    };
  }
  async touchActivity(userId, timestamp = (/* @__PURE__ */ new Date()).toISOString()) {
    if (!userId || userId.length > 128) throw new Error("Invalid user id");
    const result = await this.database.prepare(
      "UPDATE app_users SET record_json = json_set(record_json, '$.lastActivityAt', ?), updated_at = ? WHERE id = ?"
    ).bind(timestamp, timestamp, userId).run();
    if (!result.success) throw new Error("Failed to update user activity");
    return Number(result.meta?.changes || 0) > 0;
  }
};

// server/cloudflare/workerAuth.ts
var encoder = new TextEncoder();
var MAX_TOKEN_LENGTH = 4096;
var MAX_TOKEN_LIFETIME_SECONDS = 30 * 24 * 60 * 60;
function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
__name(toBase64Url, "toBase64Url");
function fromBase64Url(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid base64url");
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
__name(fromBase64Url, "fromBase64Url");
async function importHmacKey(secret) {
  if (typeof secret !== "string" || secret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters");
  }
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}
__name(importHmacKey, "importHmacKey");
function isValidPayload(value, now) {
  if (!value || typeof value !== "object") return false;
  const payload = value;
  return typeof payload.userId === "string" && payload.userId.length >= 1 && payload.userId.length <= 128 && typeof payload.role === "string" && payload.role.length >= 1 && payload.role.length <= 64 && Number.isSafeInteger(payload.iat) && Number.isSafeInteger(payload.exp) && Number.isSafeInteger(payload.ver) && payload.ver >= 0 && payload.iat > 0 && payload.iat <= now + 60 && payload.exp > now && payload.exp > payload.iat && payload.exp - payload.iat <= MAX_TOKEN_LIFETIME_SECONDS;
}
__name(isValidPayload, "isValidPayload");
async function signWorkerAuthToken(user, secret, versions, ttlSeconds = 7 * 24 * 60 * 60, nowSeconds = Math.floor(Date.now() / 1e3)) {
  if (!user?.id || user.id.length > 128 || !user.role || user.role.length > 64) {
    throw new Error("Invalid user identity");
  }
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > MAX_TOKEN_LIFETIME_SECONDS) {
    throw new Error("Invalid token lifetime");
  }
  const version = await versions.getAuthVersion(user.id);
  if (!Number.isSafeInteger(version) || version < 0) {
    throw new Error("Invalid authentication version");
  }
  const payload = {
    userId: user.id,
    role: user.role,
    iat: nowSeconds,
    exp: nowSeconds + ttlSeconds,
    ver: version
  };
  const encoded = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const key = await importHmacKey(secret);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(encoded)));
  return encoded + "." + toBase64Url(signature);
}
__name(signWorkerAuthToken, "signWorkerAuthToken");
async function verifyWorkerAuthToken(token, secret, versions, nowSeconds = Math.floor(Date.now() / 1e3)) {
  if (typeof token !== "string" || token.length > MAX_TOKEN_LENGTH) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  try {
    const key = await importHmacKey(secret);
    const signature = fromBase64Url(parts[1]);
    const validSignature = await crypto.subtle.verify(
      "HMAC",
      key,
      signature.slice().buffer,
      encoder.encode(parts[0])
    );
    if (!validSignature) return null;
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(fromBase64Url(parts[0]));
    const payload = JSON.parse(decoded);
    if (!isValidPayload(payload, nowSeconds)) return null;
    const currentVersion = await versions.getAuthVersion(payload.userId);
    if (!Number.isSafeInteger(currentVersion) || currentVersion !== payload.ver) return null;
    return payload;
  } catch {
    return null;
  }
}
__name(verifyWorkerAuthToken, "verifyWorkerAuthToken");

// server/cloudflare/workerAuthService.ts
var GRADES = new Set(Array.from({ length: 9 }, (_, i) => `Grade ${i + 1}`));
var USERNAME = /^[a-zA-Z0-9._-]{3,32}$/;
var MAX_PASSWORD_LENGTH = 128;
function parseRecord(raw) {
  if (typeof raw !== "string") throw new Error("Stored record is missing");
  const value = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Stored record is malformed");
  return value;
}
__name(parseRecord, "parseRecord");
async function rateKey(scope, ip, identity) {
  const input = new TextEncoder().encode(`${scope}| ${ip.slice(0, 128)} | ${identity.toLowerCase().slice(0, 64)}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  let binary = "";
  for (const byte of digest) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
__name(rateKey, "rateKey");
var WorkerAuthService = class {
  constructor(database, secret) {
    this.database = database;
    this.secret = secret;
    if (typeof secret !== "string" || secret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
    this.users = new D1UserRepository(database);
    this.versions = new D1AuthVersionReader(database);
  }
  static {
    __name(this, "WorkerAuthService");
  }
  async consumeRateLimit(scope, ip, identity, limit, windowMs) {
    const key = await rateKey(scope, ip, identity);
    const now = Date.now();
    const row = await this.database.prepare(
      "INSERT INTO auth_rate_limits (bucket_key, window_started_at, attempts, locked_until) VALUES (?, ?, 1, NULL) ON CONFLICT(bucket_key) DO UPDATE SET attempts = CASE WHEN auth_rate_limits.window_started_at + ? <= ? THEN 1 ELSE auth_rate_limits.attempts + 1 END, window_started_at = CASE WHEN auth_rate_limits.window_started_at + ? <= ? THEN ? ELSE auth_rate_limits.window_started_at END RETURNING attempts"
    ).bind(key, now, windowMs, now, windowMs, now, now).first();
    if (!row) throw new Error("Rate limit state could not be updated");
    return limit - Number(row.attempts);
  }
  async register(body, ip, userAgent) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { status: 400, body: { error: "\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062A\u0633\u062C\u064A\u0644 \u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644\u0629" } };
    }
    const input = body;
    const fullName = typeof input.fullName === "string" ? input.fullName.trim() : "";
    const username = typeof input.username === "string" ? input.username.trim() : "";
    const password = typeof input.password === "string" ? input.password : "";
    const confirmPassword = typeof input.confirmPassword === "string" ? input.confirmPassword : "";
    const requestedRole = input.requestedRole === "SchoolAdmin" ? "SchoolAdmin" : input.requestedRole === "Teacher" ? "Teacher" : null;
    if (input.requestedRole === "PlatformOwner" || input.requestedRole === "Administrator") {
      return { status: 403, body: { error: "\u063A\u064A\u0631 \u0645\u0633\u0645\u0648\u062D \u0628\u0627\u0644\u062A\u0633\u062C\u064A\u0644 \u0628\u062F\u0648\u0631 \u0645\u0627\u0644\u0643 \u0627\u0644\u0645\u0646\u0635\u0629" } };
    }
    if (fullName.length < 3 || fullName.length > 120 || !USERNAME.test(username)) {
      return { status: 400, body: { error: "\u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u0643\u0627\u0645\u0644 \u0648\u0627\u0633\u0645 \u0645\u0633\u062A\u062E\u062F\u0645 \u0635\u062D\u064A\u062D" } };
    }
    if (!requestedRole) return { status: 400, body: { error: "\u0627\u0644\u062F\u0648\u0631 \u0627\u0644\u0645\u0637\u0644\u0648\u0628 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D" } };
    if (password.length < 8 || password.length > MAX_PASSWORD_LENGTH) {
      return { status: 400, body: { error: "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u064A\u062C\u0628 \u0623\u0646 \u062A\u0643\u0648\u0646 \u0628\u064A\u0646 8 \u0648128 \u062D\u0631\u0641\u0627\u064B" } };
    }
    if (password !== confirmPassword) return { status: 400, body: { error: "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0648\u062A\u0623\u0643\u064A\u062F\u0647\u0627 \u063A\u064A\u0631 \u0645\u062A\u0637\u0627\u0628\u0642\u062A\u064A\u0646" } };
    const remaining = await this.consumeRateLimit("register", ip, username, 8, 15 * 60 * 1e3);
    if (remaining < 0) return { status: 429, body: { error: "\u062A\u0645 \u062A\u062C\u0627\u0648\u0632 \u0645\u062D\u0627\u0648\u0644\u0627\u062A \u0627\u0644\u062A\u0633\u062C\u064A\u0644. \u062D\u0627\u0648\u0644 \u0644\u0627\u062D\u0642\u0627\u064B." } };
    const subjects = Array.isArray(input.assignedSubjects) ? input.assignedSubjects.filter((v) => typeof v === "string") : [];
    const grades = Array.isArray(input.assignedGrades) ? input.assignedGrades.filter((v) => typeof v === "string") : [];
    let assignedSubjects = ["all"];
    let assignedGrades = ["all"];
    if (requestedRole === "Teacher") {
      const subjectRows = await this.database.prepare("SELECT record_json FROM subjects WHERE is_active = 1").all();
      if (!subjectRows.success) throw new Error("Could not validate subject assignments");
      const allowed = new Set((subjectRows.results || []).map((row) => String(parseRecord(row.record_json).id)));
      if (!subjects.length || subjects.includes("all") || !subjects.every((id2) => allowed.has(id2)) || !grades.length || grades.includes("all") || !grades.every((grade) => GRADES.has(grade))) {
        return { status: 400, body: { error: "\u064A\u062C\u0628 \u062A\u062D\u062F\u064A\u062F \u0645\u0627\u062F\u0629 \u0648\u0635\u0641 \u062F\u0631\u0627\u0633\u064A \u0635\u062D\u064A\u062D\u064A\u0646 \u0645\u0646 \u0627\u0644\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0645\u0633\u0645\u0648\u062D \u0628\u0647\u0627" } };
      }
      assignedSubjects = subjects;
      assignedGrades = grades;
    }
    const existingUser = await this.database.prepare("SELECT id FROM app_users WHERE username = ? COLLATE NOCASE LIMIT 1").bind(username).first();
    if (existingUser) return { status: 409, body: { error: "\u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u0645\u0633\u062A\u062E\u062F\u0645 \u0628\u0627\u0644\u0641\u0639\u0644" } };
    const existingRequest = await this.database.prepare(
      "SELECT id FROM registration_requests WHERE username = ? COLLATE NOCASE AND status IN ('PENDING_APPROVAL','NEEDS_EDIT') LIMIT 1"
    ).bind(username).first();
    if (existingRequest) return { status: 409, body: { error: "\u064A\u0648\u062C\u062F \u0637\u0644\u0628 \u062A\u0633\u062C\u064A\u0644 \u0642\u0627\u0626\u0645 \u0628\u0647\u0630\u0627 \u0627\u0644\u0627\u0633\u0645" } };
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const id = `reg-${crypto.randomUUID()}`;
    const passwordHash = await bcryptjs_default.hash(password, 10);
    const record = {
      id,
      fullName,
      username,
      passwordHash,
      requestedRole,
      assignedSubjects,
      assignedGrades,
      phone: typeof input.phone === "string" ? input.phone.trim().slice(0, 40) : void 0,
      notes: typeof input.notes === "string" ? input.notes.trim().slice(0, 1e3) : void 0,
      status: "PENDING_APPROVAL",
      ipAddress: ip.slice(0, 128),
      userAgent: userAgent.slice(0, 300),
      createdAt: now,
      updatedAt: now
    };
    const insert = await this.database.prepare(
      "INSERT INTO registration_requests (id, username, status, record_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(id, username, "PENDING_APPROVAL", JSON.stringify(record), now, now).run();
    if (!insert.success) throw new Error("Registration request could not be saved");
    const { passwordHash: _hash2, ...safeRequest } = record;
    return {
      status: 201,
      body: {
        success: true,
        status: "PENDING_APPROVAL",
        request: safeRequest,
        message: "\u062A\u0645 \u0625\u0631\u0633\u0627\u0644 \u0637\u0644\u0628 \u0627\u0644\u062A\u0633\u062C\u064A\u0644 \u0648\u0647\u0648 \u0628\u0627\u0646\u062A\u0638\u0627\u0631 \u0645\u0631\u0627\u062C\u0639\u0629 \u0645\u0627\u0644\u0643 \u0627\u0644\u0645\u0646\u0635\u0629."
      }
    };
  }
  async listRegistrationRequests(status) {
    const allowed = /* @__PURE__ */ new Set(["PENDING_APPROVAL", "NEEDS_EDIT", "APPROVED", "REJECTED"]);
    const cleanStatus = status && allowed.has(status) ? status : void 0;
    const result = cleanStatus ? await this.database.prepare("SELECT record_json FROM registration_requests WHERE status = ? ORDER BY created_at DESC").bind(cleanStatus).all() : await this.database.prepare("SELECT record_json FROM registration_requests ORDER BY created_at DESC").all();
    if (!result.success) throw new Error("Registration requests could not be listed");
    return (result.results || []).map((row) => {
      const record = parseRecord(row.record_json);
      const { passwordHash: _hash2, ...safe } = record;
      return safe;
    });
  }
  async approveRegistrationRequest(requestId, reviewer, overrides = {}) {
    if (!requestId || requestId.length > 128) throw new Error("Invalid registration request id");
    const row = await this.database.prepare(
      "SELECT record_json FROM registration_requests WHERE id = ? LIMIT 1"
    ).bind(requestId).first();
    if (!row) return null;
    const rawRequest = parseRecord(row.record_json);
    if (!["PENDING_APPROVAL", "NEEDS_EDIT"].includes(String(rawRequest.status))) {
      throw new Error("Registration request is not awaiting approval");
    }
    if (typeof rawRequest.passwordHash !== "string" || rawRequest.passwordHash.length < 20) {
      throw new Error("Registration request credential is malformed");
    }
    const existing = await this.database.prepare(
      "SELECT id FROM app_users WHERE username = ? COLLATE NOCASE LIMIT 1"
    ).bind(String(rawRequest.username)).first();
    if (existing) throw new Error("Username already exists");
    const finalRole = overrides.role === "SchoolAdmin" || overrides.role === "Teacher" ? overrides.role : rawRequest.requestedRole === "SchoolAdmin" ? "SchoolAdmin" : "Teacher";
    let assignedSubjects = ["all"];
    let assignedGrades = ["all"];
    if (finalRole === "Teacher") {
      const subjectRows = await this.database.prepare("SELECT record_json FROM subjects WHERE is_active = 1").all();
      if (!subjectRows.success) throw new Error("Could not validate subject assignments");
      const allowed = new Set((subjectRows.results || []).map((item) => String(parseRecord(item.record_json).id)));
      const subjectOverride = Array.isArray(overrides.assignedSubjects) ? overrides.assignedSubjects : rawRequest.assignedSubjects;
      const gradeOverride = Array.isArray(overrides.assignedGrades) ? overrides.assignedGrades : rawRequest.assignedGrades;
      if (!Array.isArray(subjectOverride) || !subjectOverride.length || subjectOverride.includes("all") || !subjectOverride.every((value) => typeof value === "string" && allowed.has(value)) || !Array.isArray(gradeOverride) || !gradeOverride.length || gradeOverride.includes("all") || !gradeOverride.every((value) => typeof value === "string" && GRADES.has(value))) {
        throw new Error("Teacher assignments are invalid");
      }
      assignedSubjects = subjectOverride;
      assignedGrades = gradeOverride;
    }
    const schoolRow = await this.database.prepare("SELECT record_json FROM school_settings WHERE singleton_id = 1").first();
    const schoolSettings = schoolRow ? parseRecord(schoolRow.record_json) : {};
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const userId = `usr-${crypto.randomUUID()}`;
    const user = {
      id: userId,
      username: String(rawRequest.username),
      name: String(rawRequest.fullName),
      role: finalRole,
      status: "ACTIVE",
      hasAIAccess: false,
      assignedSubjects,
      assignedGrades,
      phone: rawRequest.phone,
      school: typeof schoolSettings.schoolNameAr === "string" ? schoolSettings.schoolNameAr : "\u0645\u062F\u0631\u0633\u0629 \u0642\u0641\u0644\u0629 \u0644\u0644\u062A\u0639\u0644\u064A\u0645 \u0627\u0644\u0623\u0633\u0627\u0633\u064A",
      registrationRequestId: requestId,
      reviewedBy: String(reviewer.id),
      reviewedByName: String(reviewer.name || ""),
      reviewedAt: now,
      reviewNotes: typeof overrides.reviewNote === "string" ? overrides.reviewNote.slice(0, 1e3) : rawRequest.reviewNote,
      delegatedPermissions: finalRole === "SchoolAdmin" ? {
        canManageTeachers: true,
        canManageSubjects: true,
        canManageIdentity: true,
        canManageCurricula: true
      } : void 0,
      createdAt: now,
      passwordHash: rawRequest.passwordHash,
      authVersion: 0
    };
    const updatedRequest = {
      ...rawRequest,
      status: "APPROVED",
      reviewedBy: String(reviewer.id),
      reviewedByName: String(reviewer.name || ""),
      reviewedAt: now,
      reviewNote: typeof overrides.reviewNote === "string" ? overrides.reviewNote.slice(0, 1e3) : rawRequest.reviewNote,
      approvedUserId: userId,
      updatedAt: now
    };
    if (!this.database.batch) throw new Error("Transactional D1 batch is required for account approval");
    const results = await this.database.batch([
      this.database.prepare(
        "UPDATE registration_requests SET status = 'APPROVED', record_json = ?, updated_at = ? WHERE id = ? AND status IN ('PENDING_APPROVAL','NEEDS_EDIT')"
      ).bind(JSON.stringify(updatedRequest), now, requestId),
      this.database.prepare(
        "INSERT INTO app_users (id, username, role, status, record_json, created_at, updated_at) SELECT ?, ?, ?, 'ACTIVE', ?, ?, ? WHERE EXISTS (SELECT 1 FROM registration_requests WHERE id = ? AND status = 'APPROVED' AND json_extract(record_json, '$.approvedUserId') = ?)"
      ).bind(userId, user.username, user.role, JSON.stringify(user), now, now, requestId, userId)
    ]);
    const requestChanges = Number(results[0]?.meta?.changes || 0);
    const userChanges = Number(results[1]?.meta?.changes || 0);
    if (requestChanges !== 1 || userChanges !== 1) {
      throw new Error("Registration approval lost a concurrent update; no account was created");
    }
    const { passwordHash: _requestHash, ...safeRequest } = updatedRequest;
    const { passwordHash: _userHash, authVersion: _version, ...safeUser } = user;
    return { request: safeRequest, user: safeUser };
  }
  async reviewRegistrationRequest(requestId, reviewer, status, reviewNote) {
    if (!requestId || requestId.length > 128) throw new Error("Invalid registration request id");
    const row = await this.database.prepare("SELECT record_json FROM registration_requests WHERE id = ? LIMIT 1").bind(requestId).first();
    if (!row) return null;
    const record = parseRecord(row.record_json);
    if (!["PENDING_APPROVAL", "NEEDS_EDIT"].includes(String(record.status))) {
      throw new Error("Registration request is no longer pending");
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const updated = {
      ...record,
      status,
      reviewedBy: String(reviewer.id),
      reviewedByName: String(reviewer.name || ""),
      reviewedAt: now,
      reviewNote: reviewNote.slice(0, 1e3),
      updatedAt: now
    };
    const result = await this.database.prepare(
      "UPDATE registration_requests SET status = ?, record_json = ?, updated_at = ? WHERE id = ? AND status IN ('PENDING_APPROVAL','NEEDS_EDIT')"
    ).bind(status, JSON.stringify(updated), now, requestId).run();
    if (!result.success) throw new Error("Registration review update failed");
    if (Number(result.meta?.changes || 0) !== 1) throw new Error("Registration request changed concurrently");
    const { passwordHash: _hash2, ...safe } = updated;
    return safe;
  }
  async login(body, ip) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { status: 400, body: { error: "\u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u0648\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631" } };
    }
    const input = body;
    const username = typeof input.username === "string" ? input.username.trim() : "";
    const password = typeof input.password === "string" ? input.password : "";
    if (!USERNAME.test(username) || !password || password.length > MAX_PASSWORD_LENGTH) {
      return { status: 400, body: { error: "\u064A\u0631\u062C\u0649 \u0625\u062F\u062E\u0627\u0644 \u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u0648\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631" } };
    }
    const remaining = await this.consumeRateLimit("login-ip", ip, "all", 20, 10 * 60 * 1e3);
    if (remaining < 0) return { status: 429, body: { error: "\u062A\u0645 \u0625\u064A\u0642\u0627\u0641 \u0645\u062D\u0627\u0648\u0644\u0627\u062A \u0627\u0644\u062F\u062E\u0648\u0644 \u0645\u0624\u0642\u062A\u0627\u064B. \u062D\u0627\u0648\u0644 \u0644\u0627\u062D\u0642\u0627\u064B.", code: "RATE_LIMITED" } };
    const user = await this.users.findForLoginByUsername(username);
    if (!user) {
      const pending = await this.database.prepare(
        "SELECT record_json FROM registration_requests WHERE username = ? COLLATE NOCASE ORDER BY created_at DESC LIMIT 1"
      ).bind(username).first();
      if (pending) {
        const request = parseRecord(pending.record_json);
        const status = String(request.status || "PENDING_APPROVAL");
        const message = status === "NEEDS_EDIT" ? "\u0637\u0644\u0628 \u0627\u0644\u062A\u0633\u062C\u064A\u0644 \u064A\u062D\u062A\u0627\u062C \u0625\u0644\u0649 \u0627\u0633\u062A\u0643\u0645\u0627\u0644 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A." : status === "REJECTED" ? "\u062A\u0645 \u0631\u0641\u0636 \u0637\u0644\u0628 \u0627\u0644\u062A\u0633\u062C\u064A\u0644." : "\u0637\u0644\u0628 \u0627\u0644\u062A\u0633\u062C\u064A\u0644 \u0642\u064A\u062F \u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629 \u0648\u0628\u0627\u0646\u062A\u0638\u0627\u0631 \u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629.";
        return { status: 403, body: { error: message, accountStatus: status } };
      }
      return { status: 401, body: { error: "\u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u0623\u0648 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629" } };
    }
    if (user.lockedUntil && new Date(String(user.lockedUntil)).getTime() > Date.now()) {
      const retryAfterSec = Math.ceil((new Date(String(user.lockedUntil)).getTime() - Date.now()) / 1e3);
      return { status: 429, body: { error: "\u0627\u0644\u062D\u0633\u0627\u0628 \u0645\u0642\u0641\u0644 \u0645\u0624\u0642\u062A\u0627\u064B \u0628\u0633\u0628\u0628 \u0645\u062D\u0627\u0648\u0644\u0627\u062A \u062F\u062E\u0648\u0644 \u0641\u0627\u0634\u0644\u0629.", code: "ACCOUNT_TEMP_LOCKED", retryAfterSec } };
    }
    if ((user.status || "ACTIVE") !== "ACTIVE") {
      const status = String(user.status || "ACTIVE");
      return { status: 403, body: { error: status === "SUSPENDED" ? "\u0627\u0644\u062D\u0633\u0627\u0628 \u0645\u0648\u0642\u0648\u0641 \u0645\u0624\u0642\u062A\u0627\u064B." : "\u0627\u0644\u062D\u0633\u0627\u0628 \u063A\u064A\u0631 \u0645\u0641\u0639\u0644 \u0623\u0648 \u0628\u0627\u0646\u062A\u0638\u0627\u0631 \u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629.", accountStatus: status } };
    }
    const valid = await bcryptjs_default.compare(password, String(user.passwordHash));
    if (!valid) {
      const failure = await this.users.recordLoginFailure(user.id, 5, 10 * 60 * 1e3);
      return failure.lockedUntil ? { status: 429, body: { error: "\u062A\u0645 \u062A\u0639\u0644\u064A\u0642 \u0645\u062D\u0627\u0648\u0644\u0627\u062A \u0627\u0644\u062F\u062E\u0648\u0644 \u0645\u0624\u0642\u062A\u0627\u064B \u0644\u062D\u0645\u0627\u064A\u0629 \u0627\u0644\u062D\u0633\u0627\u0628.", code: "ACCOUNT_TEMP_LOCKED" } } : { status: 401, body: { error: "\u0627\u0633\u0645 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u0623\u0648 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629" } };
    }
    await this.users.recordLoginSuccess(user.id);
    const token = await signWorkerAuthToken({ id: user.id, role: user.role }, this.secret, this.versions);
    const current = await this.users.findPublicById(user.id);
    if (!current) throw new Error("User disappeared after successful authentication");
    return { status: 200, body: { success: true, token, user: current } };
  }
};

// server/cloudflare/workerAuthGuard.ts
function bearerToken(request) {
  const header = request.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token.length > 0 && token.length <= 4096 ? token : null;
}
__name(bearerToken, "bearerToken");
async function authenticateWorkerRequest(request, secret, versions, users, nowSeconds = Math.floor(Date.now() / 1e3)) {
  const tokenText = bearerToken(request);
  if (!tokenText) return { ok: false, status: 401, error: "UNAUTHENTICATED" };
  const token = await verifyWorkerAuthToken(tokenText, secret, versions, nowSeconds);
  if (!token) return { ok: false, status: 401, error: "UNAUTHENTICATED" };
  const user = await users.findPublicById(token.userId);
  if (!user) return { ok: false, status: 401, error: "UNAUTHENTICATED" };
  if (user.status !== "ACTIVE") return { ok: false, status: 403, error: "ACCOUNT_INACTIVE" };
  if (user.role !== token.role) return { ok: false, status: 401, error: "UNAUTHENTICATED" };
  return { ok: true, user, token };
}
__name(authenticateWorkerRequest, "authenticateWorkerRequest");

// server/cloudflare/questionImageStorage.ts
var ALLOWED_TYPES = /* @__PURE__ */ new Set(["image/jpeg", "image/png", "image/webp"]);
var MAX_IMAGE_BYTES = 2936012;
function hasValidImageSignature(contentType, bytes) {
  if (contentType === "image/png") {
    return bytes.length >= 8 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10;
  }
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  }
  if (contentType === "image/webp") {
    return bytes.length >= 12 && bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70 && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80;
  }
  return false;
}
__name(hasValidImageSignature, "hasValidImageSignature");
function assertSafeSegment(value, label) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new Error(`Invalid ${label}`);
  }
}
__name(assertSafeSegment, "assertSafeSegment");
async function sha256Hex(bytes) {
  const digestInput = new Uint8Array(bytes.byteLength);
  digestInput.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", digestInput.buffer);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}
__name(sha256Hex, "sha256Hex");
var QuestionImageStorage = class {
  constructor(bucket, database) {
    this.bucket = bucket;
    this.database = database;
  }
  static {
    __name(this, "QuestionImageStorage");
  }
  async upload(input) {
    assertSafeSegment(input.ownerId, "owner id");
    assertSafeSegment(input.questionId, "question id");
    if (!ALLOWED_TYPES.has(input.contentType)) throw new Error("Unsupported image type");
    if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new Error("Image size is outside the allowed range");
    }
    if (!hasValidImageSignature(input.contentType, input.bytes)) {
      throw new Error("Image content does not match the declared image type");
    }
    const metadata = {
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      questionId: input.questionId,
      objectKey: `question-images/${input.ownerId}/${input.questionId}/${crypto.randomUUID()}`,
      contentType: input.contentType,
      byteSize: input.bytes.byteLength,
      checksumSha256: await sha256Hex(input.bytes),
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await this.bucket.put(metadata.objectKey, input.bytes, {
      httpMetadata: { contentType: metadata.contentType },
      customMetadata: { ownerId: metadata.ownerId, questionId: metadata.questionId, imageId: metadata.id }
    });
    try {
      const record = {
        id: metadata.id,
        ownerId: metadata.ownerId,
        questionId: metadata.questionId,
        objectKey: metadata.objectKey,
        contentType: metadata.contentType,
        byteSize: metadata.byteSize,
        checksumSha256: metadata.checksumSha256,
        createdAt: metadata.createdAt
      };
      const result = await this.database.prepare(
        "INSERT INTO question_images (id, owner_id, question_id, object_key, content_type, byte_size, checksum_sha256, record_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(
        metadata.id,
        metadata.ownerId,
        metadata.questionId,
        metadata.objectKey,
        metadata.contentType,
        metadata.byteSize,
        metadata.checksumSha256,
        JSON.stringify(record),
        metadata.createdAt
      ).run();
      if (!result.success) throw new Error("Could not save image metadata");
      return metadata;
    } catch (error) {
      await this.bucket.delete(metadata.objectKey).catch(() => void 0);
      throw error;
    }
  }
  async getForOwner(imageId, ownerId) {
    assertSafeSegment(imageId, "image id");
    assertSafeSegment(ownerId, "owner id");
    const row = await this.database.prepare(
      "SELECT object_key, content_type, byte_size FROM question_images WHERE id = ? AND owner_id = ? LIMIT 1"
    ).bind(imageId, ownerId).first();
    if (!row) return null;
    const object = await this.bucket.get(row.object_key);
    if (!object) return null;
    return {
      bytes: await object.arrayBuffer(),
      contentType: row.content_type,
      byteSize: Number(row.byte_size)
    };
  }
  async deleteForOwner(imageId, ownerId) {
    assertSafeSegment(imageId, "image id");
    assertSafeSegment(ownerId, "owner id");
    const row = await this.database.prepare(
      "SELECT object_key FROM question_images WHERE id = ? AND owner_id = ? LIMIT 1"
    ).bind(imageId, ownerId).first();
    if (!row) return false;
    const removed = await this.database.prepare(
      "DELETE FROM question_images WHERE id = ? AND owner_id = ?"
    ).bind(imageId, ownerId).run();
    if (!removed.success || Number(removed.meta?.changes || 0) !== 1) {
      throw new Error("Image metadata could not be removed");
    }
    await this.bucket.delete(row.object_key);
    return true;
  }
};

// server/examImageValidation.ts
function hasValidExamImagePayload(exam) {
  if (!Array.isArray(exam?.sections)) return true;
  let totalBytes = 0;
  for (const section of exam.sections) {
    if (!Array.isArray(section?.questions)) continue;
    for (const question of section.questions) {
      const image = question?.imageDataUrl;
      if (image === void 0 || image === null || image === "") continue;
      if (typeof image !== "string" || !/^data:image\/(?:png|jpeg|webp);base64,/i.test(image)) return false;
      if (image.length > 4e6) return false;
      totalBytes += image.length;
      if (totalBytes > 85e5) return false;
    }
  }
  return true;
}
__name(hasValidExamImagePayload, "hasValidExamImagePayload");

// server/cloudflare/defaultCurricula.ts
var DEFAULT_CURRICULA = [
  // Grade 7
  {
    id: "g7-u1",
    grade: "Grade 7",
    unitNumber: 1,
    title: "Unit 1: Hello & School",
    titleAr: "\u0627\u0644\u0648\u062D\u062F\u0629 \u0627\u0644\u0623\u0648\u0644\u0649: \u0645\u0631\u062D\u0628\u0627\u064B \u0648\u0627\u0644\u0645\u062F\u0631\u0633\u0629",
    description: "Greetings, the alphabet, classroom objects, numbers 1-20, verb to be.",
    lessons: [
      {
        id: "g7-u1-l1",
        unitId: "g7-u1",
        lessonNumber: 1,
        title: "Greetings & Introductions",
        titleAr: "\u0627\u0644\u062A\u062D\u064A\u0627\u062A \u0648\u0627\u0644\u062A\u0639\u0627\u0631\u0641",
        vocabulary: ["Hello", "Good morning", "Name", "Teacher", "Friend"],
        grammarPoints: ["Verb to be (am, is, are)", "Personal pronouns (I, you, he, she)"],
        skills: ["Speaking", "Listening"]
      },
      {
        id: "g7-u1-l2",
        unitId: "g7-u1",
        lessonNumber: 2,
        title: "Classroom Objects & Numbers",
        titleAr: "\u0623\u062F\u0648\u0627\u062A \u0627\u0644\u0641\u0635\u0644 \u0648\u0627\u0644\u0623\u0631\u0642\u0627\u0645",
        vocabulary: ["Book", "Pen", "Pencil", "Desk", "Board", "Ruler", "Bag"],
        grammarPoints: ["Singular and plural nouns (-s)", "Articles a / an"],
        skills: ["Reading", "Writing"]
      }
    ]
  },
  {
    id: "g7-u2",
    grade: "Grade 7",
    unitNumber: 2,
    title: "Unit 2: Family and Animals",
    titleAr: "\u0627\u0644\u0648\u062D\u062F\u0629 \u0627\u0644\u062B\u0627\u0646\u064A\u0629: \u0627\u0644\u0639\u0627\u0626\u0644\u0629 \u0648\u0627\u0644\u062D\u064A\u0648\u0627\u0646\u0627\u062A",
    description: "Family members, pets, farm animals, have got / has got.",
    lessons: [
      {
        id: "g7-u2-l1",
        unitId: "g7-u2",
        lessonNumber: 1,
        title: "My Family",
        titleAr: "\u0639\u0627\u0626\u0644\u062A\u064A",
        vocabulary: ["Father", "Mother", "Brother", "Sister", "Grandfather", "Grandmother"],
        grammarPoints: ["Possessive adjectives (my, your, his, her)", "Possessive 's"],
        skills: ["Speaking", "Reading"]
      },
      {
        id: "g7-u2-l2",
        unitId: "g7-u2",
        lessonNumber: 2,
        title: "Animals in Yemen",
        titleAr: "\u0627\u0644\u062D\u064A\u0648\u0627\u0646\u0627\u062A \u0641\u064A \u0627\u0644\u064A\u0645\u0646",
        vocabulary: ["Camel", "Goat", "Sheep", "Horse", "Cat", "Dog", "Bird"],
        grammarPoints: ["Have got / has got (affirmative & negative)", "Can / cannot for abilities"],
        skills: ["Reading", "Writing"]
      }
    ]
  },
  {
    id: "g7-u3",
    grade: "Grade 7",
    unitNumber: 3,
    title: "Unit 3: Daily Routine & Time",
    titleAr: "\u0627\u0644\u0648\u062D\u062F\u0629 \u0627\u0644\u062B\u0627\u0644\u062B\u0629: \u0627\u0644\u0631\u0648\u062A\u064A\u0646 \u0627\u0644\u064A\u0648\u0645\u064A \u0648\u0627\u0644\u0648\u0642\u062A",
    description: "Telling time, morning and evening habits, present simple tense.",
    lessons: [
      {
        id: "g7-u3-l1",
        unitId: "g7-u3",
        lessonNumber: 1,
        title: "Telling the Time",
        titleAr: "\u0625\u062E\u0628\u0627\u0631 \u0627\u0644\u0648\u0642\u062A",
        vocabulary: ["O'clock", "Half past", "Quarter past", "Quarter to", "Morning", "Evening"],
        grammarPoints: ["Telling the time: What time is it?", "Prepositions of time: at, in, on"],
        skills: ["Speaking", "Listening"]
      },
      {
        id: "g7-u3-l2",
        unitId: "g7-u3",
        lessonNumber: 2,
        title: "My Daily Routine",
        titleAr: "\u0631\u0648\u062A\u064A\u0646\u064A \u0627\u0644\u064A\u0648\u0645\u064A",
        vocabulary: ["Wake up", "Pray", "Wash", "Eat breakfast", "Go to school", "Do homework"],
        grammarPoints: ["Present Simple with I/we/they/he/she", "Adverbs of frequency: always, usually, never"],
        skills: ["Reading", "Writing"]
      }
    ]
  },
  {
    id: "g7-u4",
    grade: "Grade 7",
    unitNumber: 4,
    title: "Unit 4: Food, Drink and Health",
    titleAr: "\u0627\u0644\u0648\u062D\u062F\u0629 \u0627\u0644\u0631\u0627\u0628\u0639\u0629: \u0627\u0644\u0637\u0639\u0627\u0645 \u0648\u0627\u0644\u0634\u0631\u0627\u0628 \u0648\u0627\u0644\u0635\u062D\u0629",
    description: "Types of food, fruits, vegetables, countable/uncountable, some/any.",
    lessons: [
      {
        id: "g7-u4-l1",
        unitId: "g7-u4",
        lessonNumber: 1,
        title: "Healthy Food in Yemen",
        titleAr: "\u0627\u0644\u0637\u0639\u0627\u0645 \u0627\u0644\u0635\u062D\u064A \u0641\u064A \u0627\u0644\u064A\u0645\u0646",
        vocabulary: ["Bread", "Rice", "Milk", "Apple", "Tomato", "Fish", "Water", "Honey"],
        grammarPoints: ["Countable and uncountable nouns", "Some and any in affirmative/negative/questions"],
        skills: ["Reading", "Speaking"]
      }
    ]
  },
  // Grade 8
  {
    id: "g8-u1",
    grade: "Grade 8",
    unitNumber: 1,
    title: "Unit 1: Holidays and Travel",
    titleAr: "\u0627\u0644\u0648\u062D\u062F\u0629 \u0627\u0644\u0623\u0648\u0644\u0649: \u0627\u0644\u0625\u062C\u0627\u0632\u0627\u062A \u0648\u0627\u0644\u0633\u0641\u0631",
    description: "Holiday trips, transport in Yemen, past simple tense of regular and irregular verbs.",
    lessons: [
      {
        id: "g8-u1-l1",
        unitId: "g8-u1",
        lessonNumber: 1,
        title: "A Visit to Aden & Taiz",
        titleAr: "\u0632\u064A\u0627\u0631\u0629 \u0625\u0644\u0649 \u0639\u062F\u0646 \u0648\u062A\u0639\u0632",
        vocabulary: ["Travel", "Beach", "Mountain", "Hotel", "Market", "Souq", "Journey", "Ticket"],
        grammarPoints: ["Past Simple regular verbs (-ed)", "Past time expressions: yesterday, last week, ago"],
        skills: ["Reading", "Writing"]
      },
      {
        id: "g8-u1-l2",
        unitId: "g8-u1",
        lessonNumber: 2,
        title: "Irregular Past Actions",
        titleAr: "\u0627\u0644\u0623\u0641\u0639\u0627\u0644 \u0627\u0644\u0645\u0627\u0636\u064A\u0629 \u0627\u0644\u0634\u0627\u0630\u0629",
        vocabulary: ["Went", "Saw", "Ate", "Bought", "Took", "Came", "Had"],
        grammarPoints: ["Past Simple irregular verbs", "Did / didn\u2019t for questions and negatives"],
        skills: ["Grammar", "Speaking"]
      }
    ]
  },
  {
    id: "g8-u2",
    grade: "Grade 8",
    unitNumber: 2,
    title: "Unit 2: Health and First Aid",
    titleAr: "\u0627\u0644\u0648\u062D\u062F\u0629 \u0627\u0644\u062B\u0627\u0646\u064A\u0629: \u0627\u0644\u0635\u062D\u0629 \u0648\u0627\u0644\u0625\u0633\u0639\u0627\u0641\u0627\u062A \u0627\u0644\u0623\u0648\u0644\u064A\u0629",
    description: "Common illnesses, health advice, giving suggestions using should / shouldn\u2019t.",
    lessons: [
      {
        id: "g8-u2-l1",
        unitId: "g8-u2",
        lessonNumber: 1,
        title: "At the Clinic",
        titleAr: "\u0641\u064A \u0627\u0644\u0639\u064A\u0627\u062F\u0629 \u0627\u0644\u0637\u0628\u064A\u0629",
        vocabulary: ["Headache", "Stomachache", "Toothache", "Fever", "Medicine", "Doctor", "Nurse"],
        grammarPoints: ["Giving advice: You should / shouldn\u2019t", "Have got a headache"],
        skills: ["Dialogue", "Listening"]
      }
    ]
  },
  {
    id: "g8-u3",
    grade: "Grade 8",
    unitNumber: 3,
    title: "Unit 3: Jobs and Workplaces",
    titleAr: "\u0627\u0644\u0648\u062D\u062F\u0629 \u0627\u0644\u062B\u0627\u0644\u062B\u0629: \u0627\u0644\u0645\u0647\u0646 \u0648\u0623\u0645\u0627\u0643\u0646 \u0627\u0644\u0639\u0645\u0644",
    description: "Occupations, daily responsibilities, present continuous versus present simple.",
    lessons: [
      {
        id: "g8-u3-l1",
        unitId: "g8-u3",
        lessonNumber: 1,
        title: "Jobs in Our Community",
        titleAr: "\u0627\u0644\u0648\u0638\u0627\u0626\u0641 \u0641\u064A \u0645\u062C\u062A\u0645\u0639\u0646\u0627",
        vocabulary: ["Farmer", "Engineer", "Carpenter", "Driver", "Pilot", "Hospital", "Farm", "Office"],
        grammarPoints: ["Present Continuous (am/is/are + verb-ing)", "Contrasting routine vs actions now"],
        skills: ["Speaking", "Reading"]
      }
    ]
  },
  {
    id: "g8-u5",
    grade: "Grade 8",
    unitNumber: 5,
    title: "Unit 5: Town and Country",
    titleAr: "\u0627\u0644\u0648\u062D\u062F\u0629 \u0627\u0644\u062E\u0627\u0645\u0633\u0629: \u0627\u0644\u0645\u062F\u064A\u0646\u0629 \u0648\u0627\u0644\u0631\u064A\u0641",
    description: "Comparing towns and villages, comparatives and superlatives.",
    lessons: [
      {
        id: "g8-u5-l1",
        unitId: "g8-u5",
        lessonNumber: 1,
        title: "Comparing Places in Yemen",
        titleAr: "\u0645\u0642\u0627\u0631\u0646\u0629 \u0627\u0644\u0623\u0645\u0627\u0643\u0646 \u0641\u064A \u0627\u0644\u064A\u0645\u0646",
        vocabulary: ["Modern", "Ancient", "Quiet", "Crowded", "High", "Clean", "Village", "City"],
        grammarPoints: ["Comparative adjectives (-er than / more ... than)", "Superlative adjectives (the -est / the most ...)"],
        skills: ["Reading", "Writing"]
      }
    ]
  },
  // Grade 9
  {
    id: "g9-u1",
    grade: "Grade 9",
    unitNumber: 1,
    title: "Unit 1: People and Places in Yemen",
    titleAr: "\u0627\u0644\u0648\u062D\u062F\u0629 \u0627\u0644\u0623\u0648\u0644\u0649: \u0627\u0644\u0646\u0627\u0633 \u0648\u0627\u0644\u0623\u0645\u0627\u0643\u0646 \u0641\u064A \u0627\u0644\u064A\u0645\u0646",
    description: "Old Sana\u2019a, Shibam Hadramout, Bab al-Yaman, historical architecture, relative clauses.",
    lessons: [
      {
        id: "g9-u1-l1",
        unitId: "g9-u1",
        lessonNumber: 1,
        title: "Historic Cities of Yemen",
        titleAr: "\u0645\u062F\u0646 \u0627\u0644\u064A\u0645\u0646 \u0627\u0644\u062A\u0627\u0631\u064A\u062E\u064A\u0629",
        vocabulary: ["Architecture", "Ancient", "Skyscraper", "Clay", "Heritage", "UNESCO", "Monument"],
        grammarPoints: ["Relative pronouns: who, which, where", "Defining relative clauses"],
        skills: ["Reading Comprehension", "Writing"]
      },
      {
        id: "g9-u1-l2",
        unitId: "g9-u1",
        lessonNumber: 2,
        title: "Describing Yemeni Traditions",
        titleAr: "\u0648\u0635\u0641 \u0627\u0644\u062A\u0642\u0627\u0644\u064A\u062F \u0627\u0644\u064A\u0645\u0646\u064A\u0629",
        vocabulary: ["Hospitality", "Coffee", "Spices", "Handicrafts", "Jambiya", "Silverware"],
        grammarPoints: ["Adjective order", "Used to + infinitive for past habits"],
        skills: ["Vocabulary", "Speaking"]
      }
    ]
  },
  {
    id: "g9-u2",
    grade: "Grade 9",
    unitNumber: 2,
    title: "Unit 2: Wildlife and Nature of Yemen",
    titleAr: "\u0627\u0644\u0648\u062D\u062F\u0629 \u0627\u0644\u062B\u0627\u0646\u064A\u0629: \u0627\u0644\u062D\u064A\u0627\u0629 \u0627\u0644\u0628\u0631\u064A\u0629 \u0648\u0627\u0644\u0637\u0628\u064A\u0639\u0629 \u0641\u064A \u0627\u0644\u064A\u0645\u0646",
    description: "Socotra Island, Arabian Leopard, endemic plants, first conditional.",
    lessons: [
      {
        id: "g9-u2-l1",
        unitId: "g9-u2",
        lessonNumber: 1,
        title: "Socotra: The Jewel of Biodiversity",
        titleAr: "\u0633\u0642\u0637\u0631\u0649: \u062C\u0648\u0647\u0631\u0629 \u0627\u0644\u062A\u0646\u0648\u0639 \u0627\u0644\u062D\u064A\u0648\u064A",
        vocabulary: ["Dragon Blood Tree", "Endemic", "Extinct", "Protect", "Island", "Reserve", "Species"],
        grammarPoints: ["First Conditional (If + present simple, will + verb)", "Imperatives for environment conservation"],
        skills: ["Reading Comprehension", "Critical Thinking"]
      }
    ]
  },
  {
    id: "g9-u3",
    grade: "Grade 9",
    unitNumber: 3,
    title: "Unit 3: Science and Inventions",
    titleAr: "\u0627\u0644\u0648\u062D\u062F\u0629 \u0627\u0644\u062B\u0627\u0644\u062B\u0629: \u0627\u0644\u0639\u0644\u0648\u0645 \u0648\u0627\u0644\u0627\u062E\u062A\u0631\u0627\u0639\u0627\u062A",
    description: "Famous Arab & Muslim scientists, technological developments, passive voice.",
    lessons: [
      {
        id: "g9-u3-l1",
        unitId: "g9-u3",
        lessonNumber: 1,
        title: "Great Muslim Scientists",
        titleAr: "\u0639\u0644\u0645\u0627\u0621 \u0627\u0644\u0645\u0633\u0644\u0645\u064A\u0646 \u0627\u0644\u0639\u0638\u0627\u0645",
        vocabulary: ["Optics", "Algebra", "Medicine", "Astronomy", "Experiment", "Discovery", "Invent"],
        grammarPoints: ["Passive Voice in Present and Past Simple (was/were + past participle)"],
        skills: ["Reading", "Grammar"]
      }
    ]
  },
  {
    id: "g9-u7",
    grade: "Grade 9",
    unitNumber: 7,
    title: "Unit 7: Stories and Life Lessons",
    titleAr: "\u0627\u0644\u0648\u062D\u062F\u0629 \u0627\u0644\u0633\u0627\u0628\u0639\u0629: \u0627\u0644\u0642\u0635\u0635 \u0648\u0627\u0644\u0639\u0650\u0628\u0631",
    description: "Fables, narrative writing, connecting words, moral of the story.",
    lessons: [
      {
        id: "g9-u7-l1",
        unitId: "g9-u7",
        lessonNumber: 1,
        title: "The Wise Merchant of Aden",
        titleAr: "\u062A\u0627\u062C\u0631 \u0639\u062F\u0646 \u0627\u0644\u062D\u0643\u064A\u0645",
        vocabulary: ["Honest", "Merchant", "Greedy", "Reward", "Gold coins", "Court", "Judge"],
        grammarPoints: ["Past Continuous vs Past Simple (while / when)", "Time connectors (First, Then, Finally)"],
        skills: ["Story Writing", "Comprehension"]
      }
    ]
  }
];

// worker.ts
var json = /* @__PURE__ */ __name((body, status = 200) => Response.json(body, {
  status,
  headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
}), "json");
function corsHeaders(request) {
  const headers = new Headers();
  const origin = request.headers.get("Origin");
  if (origin) headers.set("Vary", "Origin");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set("Access-Control-Max-Age", "600");
  return headers;
}
__name(corsHeaders, "corsHeaders");
function clientIp(request) {
  const value = request.headers.get("CF-Connecting-IP") || "";
  return value.slice(0, 128) || "unknown";
}
__name(clientIp, "clientIp");
function serviceUnavailable(env) {
  return !env.DB || typeof env.SESSION_SECRET !== "string" || env.SESSION_SECRET.length < 32;
}
__name(serviceUnavailable, "serviceUnavailable");
function canAccessQuestionScope(user, grade, subjectId) {
  const role = String(user.role || "");
  if (["PlatformOwner", "Administrator", "SchoolAdmin"].includes(role)) return true;
  const grades = Array.isArray(user.assignedGrades) ? user.assignedGrades.map(String) : [];
  const subjects = Array.isArray(user.assignedSubjects) ? user.assignedSubjects.map(String) : [];
  if (grades.length === 0 || subjects.length === 0) return false;
  return (grades.includes("all") || grades.includes(grade)) && (subjects.includes("all") || subjects.includes(subjectId));
}
__name(canAccessQuestionScope, "canAccessQuestionScope");
function canEditQuestion(user, question) {
  if (question.ownerId === user.id) return true;
  const shares = Array.isArray(question.sharedWith) ? question.sharedWith : [];
  return shares.some(
    (entry) => Boolean(entry) && typeof entry === "object" && entry.userId === user.id && entry.permission === "edit"
  );
}
__name(canEditQuestion, "canEditQuestion");
var worker_default = {
  async scheduled(_event, env) {
    if (!env.DB || !env.INITIAL_OWNER_PASSWORD || env.INITIAL_OWNER_PASSWORD.length < 16) {
      console.warn("Initial owner bootstrap is not configured");
      return;
    }
    console.log("Scheduled first-owner bootstrap started");
    const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM app_users").first();
    if (Number(count?.total || 0) !== 0) return;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const id = "usr-" + crypto.randomUUID();
    const username = env.INITIAL_OWNER_USERNAME || "abuhussam";
    const user = {
      id,
      username,
      name: "\u0645\u062F\u064A\u0631 \u0627\u0644\u0645\u0646\u0638\u0648\u0645\u0629",
      role: "PlatformOwner",
      status: "ACTIVE",
      hasAIAccess: true,
      assignedSubjects: ["all"],
      assignedGrades: ["all"],
      delegatedPermissions: { canManageTeachers: true, canManageSubjects: true, canManageIdentity: true, canManageCurricula: true },
      school: "\u0645\u062F\u0631\u0633\u0629 \u0642\u0641\u0644\u0629 \u0644\u0644\u062A\u0639\u0644\u064A\u0645 \u0627\u0644\u0623\u0633\u0627\u0633\u064A",
      createdAt: now,
      passwordHash: await bcryptjs_default.hash(env.INITIAL_OWNER_PASSWORD, 8),
      authVersion: 0
    };
    const inserted = await env.DB.prepare("INSERT INTO app_users (id,username,role,status,record_json,created_at,updated_at) SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM app_users)=0").bind(id, username, "PlatformOwner", "ACTIVE", JSON.stringify(user), now, now).run();
    console.log("Scheduled first-owner bootstrap finished", inserted.meta?.changes || 0);
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    if (url.pathname === "/owner-recovery" && request.method === "GET") {
      const recoveryPage = `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>\u0627\u0633\u062A\u0639\u0627\u062F\u0629 \u062D\u0633\u0627\u0628 \u0627\u0644\u0645\u0627\u0644\u0643</title><style>body{font-family:system-ui,sans-serif;background:#f4f6fa;margin:0;padding:24px;color:#172033}.card{max-width:440px;margin:6vh auto;background:white;padding:24px;border-radius:16px;box-shadow:0 8px 30px #10204018}h1{font-size:22px}p{line-height:1.7;color:#536078;font-size:14px}label{display:block;margin:14px 0 6px;font-size:13px;font-weight:700}input{box-sizing:border-box;width:100%;padding:12px;border:1px solid #cbd5e1;border-radius:9px;font-size:15px}button{width:100%;margin-top:18px;padding:13px;border:0;border-radius:9px;background:#9a5b08;color:white;font-weight:800;font-size:15px}#status{margin-top:14px;font-size:13px;line-height:1.6}</style><main class="card"><h1>\u0627\u0633\u062A\u0639\u0627\u062F\u0629 \u062D\u0633\u0627\u0628 \u0627\u0644\u0645\u0627\u0644\u0643</h1><p>\u0647\u0630\u0647 \u0639\u0645\u0644\u064A\u0629 \u0627\u0633\u062A\u0639\u0627\u062F\u0629 \u0644\u0645\u0631\u0629 \u0648\u0627\u062D\u062F\u0629. \u0623\u062F\u062E\u0644 \u0631\u0645\u0632 \u0627\u0644\u0627\u0633\u062A\u0639\u0627\u062F\u0629\u060C \u062B\u0645 \u0639\u064A\u0651\u0646 \u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u062C\u062F\u064A\u062F\u0629. \u0644\u0627 \u062A\u0634\u0627\u0631\u0643 \u0627\u0644\u0631\u0645\u0632 \u0645\u0639 \u0623\u064A \u0634\u062E\u0635.</p><form id="f"><label for="t">\u0631\u0645\u0632 \u0627\u0644\u0627\u0633\u062A\u0639\u0627\u062F\u0629</label><input id="t" type="password" autocomplete="off" required minlength="32"><label for="p">\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u062C\u062F\u064A\u062F\u0629</label><input id="p" type="password" autocomplete="new-password" required minlength="12" maxlength="128"><label for="c">\u062A\u0623\u0643\u064A\u062F \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631</label><input id="c" type="password" autocomplete="new-password" required minlength="12" maxlength="128"><button id="b">\u062A\u062D\u062F\u064A\u062B \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631</button></form><div id="status" role="status"></div></main><script>const f=document.getElementById("f"),s=document.getElementById("status"),b=document.getElementById("b"),t=document.getElementById("t"),p=document.getElementById("p"),c=document.getElementById("c");f.addEventListener("submit",async e=>{e.preventDefault();s.textContent="";if(p.value!==c.value){s.textContent="\u0643\u0644\u0645\u062A\u0627 \u0627\u0644\u0645\u0631\u0648\u0631 \u063A\u064A\u0631 \u0645\u062A\u0637\u0627\u0628\u0642\u062A\u064A\u0646.";return}b.disabled=true;b.textContent="\u062C\u0627\u0631\u064D \u0627\u0644\u062A\u062D\u062F\u064A\u062B...";try{const r=await fetch("/api/worker/auth/recover-owner",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({recoveryToken:t.value,newPassword:p.value})});const d=await r.json();if(!r.ok)throw new Error(d.error||"\u062A\u0639\u0630\u0631\u062A \u0627\u0644\u0627\u0633\u062A\u0639\u0627\u062F\u0629");s.textContent="\u062A\u0645 \u062A\u062D\u062F\u064A\u062B \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0628\u0646\u062C\u0627\u062D. \u0627\u0646\u062A\u0642\u0644 \u0625\u0644\u0649 \u0635\u0641\u062D\u0629 \u0627\u0644\u062F\u062E\u0648\u0644 \u0648\u0633\u062C\u0651\u0644 \u0628\u0627\u0633\u0645 abuhussam.";f.reset()}catch(e){s.textContent=e.message||"\u062D\u062F\u062B \u062E\u0637\u0623"}finally{b.disabled=false;b.textContent="\u062A\u062D\u062F\u064A\u062B \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631"}});<\/script></html>`;
      return new Response(recoveryPage, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" } });
    }
    if (!url.pathname.startsWith("/api/") && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    if (!url.pathname.startsWith("/api/") && env.QUESTION_IMAGES) {
      if (!["GET", "HEAD"].includes(request.method)) return json({ error: "Method not allowed" }, 405);
      let assetPath = "";
      try {
        assetPath = decodeURIComponent(url.pathname);
      } catch {
        return json({ error: "Invalid asset path" }, 400);
      }
      if (assetPath.includes("..") || assetPath.includes("\\") || assetPath.includes(String.fromCharCode(0))) {
        return json({ error: "Invalid asset path" }, 400);
      }
      assetPath = assetPath === "/" ? "index.html" : assetPath.startsWith("/") ? assetPath.slice(1) : assetPath;
      let asset = await env.QUESTION_IMAGES.get("frontend/" + assetPath);
      if (!asset && !assetPath.includes(".")) {
        assetPath = "index.html";
        asset = await env.QUESTION_IMAGES.get("frontend/index.html");
      }
      if (!asset) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
      const contentType = asset.httpMetadata?.contentType || "application/octet-stream";
      const cacheControl = assetPath === "index.html" ? "no-cache" : "public, max-age=31536000, immutable";
      return new Response(request.method === "HEAD" ? null : await asset.arrayBuffer(), {
        status: 200,
        headers: { "Content-Type": contentType, "Cache-Control": cacheControl, "X-Content-Type-Options": "nosniff" }
      });
    }
    if (url.pathname === "/api/worker/questions" && request.method === "GET") {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      try {
        const users = new D1UserRepository(env.DB);
        const versions = new D1AuthVersionReader(env.DB);
        const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, versions, users);
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const grade = url.searchParams.get("grade") || "";
        const subjectId = url.searchParams.get("subjectId") || "";
        const unitId = url.searchParams.get("unitId") || "";
        const type = url.searchParams.get("type") || "";
        const difficulty = url.searchParams.get("difficulty") || "";
        const search = (url.searchParams.get("search") || "").trim().toLocaleLowerCase();
        const sourceCode = url.searchParams.get("sourceCode") || "";
        const educationalLevel = url.searchParams.get("educationalLevel") || "";
        const grammarCategory = url.searchParams.get("grammarCategory") || "";
        const result = await env.DB.prepare(
          "SELECT record_json FROM questions WHERE owner_id = ? ORDER BY created_at DESC"
        ).bind(auth.user.id).all();
        if (!result.success) return json({ error: "Question bank unavailable" }, 503);
        const assignedGrades = Array.isArray(auth.user.assignedGrades) ? auth.user.assignedGrades.map(String) : [];
        const assignedSubjects = Array.isArray(auth.user.assignedSubjects) ? auth.user.assignedSubjects.map(String) : [];
        const unrestricted = ["PlatformOwner", "Administrator", "SchoolAdmin"].includes(String(auth.user.role)) || assignedGrades.includes("all") || assignedSubjects.includes("all");
        const list = (result.results || []).flatMap((row) => {
          let question;
          try {
            question = JSON.parse(row.record_json);
          } catch {
            return [];
          }
          if (typeof question.id !== "string" || typeof question.grade !== "string") return [];
          const qSubject = typeof question.subjectId === "string" ? question.subjectId : "subj-en";
          if (!unrestricted && (!assignedGrades.includes(question.grade) || !assignedSubjects.includes(qSubject))) return [];
          if (grade && question.grade !== grade) return [];
          if (subjectId && qSubject !== subjectId) return [];
          if (unitId && question.unitId !== unitId) return [];
          if (type && question.type !== type) return [];
          if (difficulty && question.difficulty !== difficulty) return [];
          if (sourceCode && question.sourceCode !== sourceCode) return [];
          if (educationalLevel && question.educationalLevel !== educationalLevel) return [];
          if (grammarCategory && question.grammarCategory !== grammarCategory) return [];
          if (search && ![question.questionText, question.instructions, question.modelAnswer].some((value) => typeof value === "string" && value.toLocaleLowerCase().includes(search))) return [];
          return [question];
        });
        return json(list);
      } catch (error) {
        console.error("Worker question bank read failed", error);
        return json({ error: "Question bank unavailable" }, 500);
      }
    }
    const questionItemPathPrefix = "/api/worker/questions/";
    const questionItemId = url.pathname.startsWith(questionItemPathPrefix) ? url.pathname.slice(questionItemPathPrefix.length) : "";
    const questionItemMatch = /^[A-Za-z0-9_-]{1,128}$/.test(questionItemId) ? questionItemId : null;
    if (url.pathname === "/api/worker/questions" && request.method === "POST" || questionItemMatch && (request.method === "PUT" || request.method === "DELETE")) {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      try {
        const users = new D1UserRepository(env.DB);
        const versions = new D1AuthVersionReader(env.DB);
        const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, versions, users);
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        if (url.pathname === "/api/worker/questions" && request.method === "POST") {
          const length = Number(request.headers.get("Content-Length") || 0);
          if (length > 1e7) return json({ error: "Question payload is too large" }, 413);
          const body2 = await request.json().catch(() => null);
          if (!body2 || typeof body2 !== "object" || Array.isArray(body2)) return json({ error: "Invalid question payload" }, 400);
          const input = body2;
          const grade = typeof input.grade === "string" ? input.grade.trim() : "";
          const subjectId = typeof input.subjectId === "string" && input.subjectId.trim() ? input.subjectId.trim() : "subj-en";
          if (typeof input.questionText !== "string" || !input.questionText.trim() || typeof input.modelAnswer !== "string" || !input.modelAnswer.trim() || !grade || grade.length > 64 || subjectId.length > 128 || input.questionText.length > 2e4 || input.modelAnswer.length > 2e4) {
            return json({ error: "Question text, grade, and model answer are required" }, 400);
          }
          if (!canAccessQuestionScope(auth.user, grade, subjectId)) {
            return json({ error: "FORBIDDEN_ACADEMIC_SCOPE" }, 403);
          }
          const role = String(auth.user.role || "");
          const hasAIAccess = ["PlatformOwner", "Administrator"].includes(role) && auth.user.hasAIAccess === true;
          const type = typeof input.type === "string" ? input.type : "";
          const isQuranQuestion = subjectId === "subj-quran" || type.startsWith("Quran");
          const createdAt = (/* @__PURE__ */ new Date()).toISOString();
          const question = {
            ...input,
            id: `q-${crypto.randomUUID()}`,
            ownerId: auth.user.id,
            subjectId,
            preserveDiacritics: isQuranQuestion ? true : input.preserveDiacritics,
            source: hasAIAccess ? input.source || "Question Bank" : "Teacher Manual",
            sourceCode: hasAIAccess ? input.sourceCode || "CURRICULUM" : input.sourceCode === "IMAGE_SOURCE" ? "TEACHER_MANUAL" : input.sourceCode || "TEACHER_MANUAL",
            educationalLevel: input.educationalLevel || "BASIC",
            sharedWith: [],
            createdAt
          };
          const result = await env.DB.prepare(
            "INSERT INTO questions (id, owner_id, subject_id, grade, unit_id, record_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)"
          ).bind(
            question.id,
            auth.user.id,
            subjectId,
            grade,
            typeof input.unitId === "string" ? input.unitId : null,
            JSON.stringify(question),
            createdAt
          ).run();
          if (!result.success) return json({ error: "Question could not be saved" }, 503);
          return json({ success: true, question });
        }
        const questionId = questionItemMatch || "";
        const row = await env.DB.prepare("SELECT record_json FROM questions WHERE id = ? LIMIT 1").bind(questionId).first();
        if (!row) return json({ error: "QUESTION_NOT_FOUND" }, 404);
        let existing;
        try {
          const parsed = JSON.parse(row.record_json);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid record");
          existing = parsed;
        } catch {
          return json({ error: "Question record is invalid" }, 500);
        }
        const existingGrade = typeof existing.grade === "string" ? existing.grade : "";
        const existingSubject = typeof existing.subjectId === "string" ? existing.subjectId : "subj-en";
        if (!canAccessQuestionScope(auth.user, existingGrade, existingSubject)) {
          return json({ error: "FORBIDDEN_ACADEMIC_SCOPE" }, 403);
        }
        if (request.method === "DELETE") {
          if ((existing.ownerId || "usr-admin") !== auth.user.id) return json({ error: "FORBIDDEN_QUESTION_DELETE" }, 403);
          const removed = await env.DB.prepare("DELETE FROM questions WHERE id = ? AND owner_id = ?").bind(questionId, auth.user.id).run();
          if (!removed.success) return json({ error: "Question could not be deleted" }, 503);
          if (Number(removed.meta?.changes || 0) !== 1) return json({ error: "QUESTION_NOT_FOUND" }, 404);
          return json({ success: true });
        }
        if (!canEditQuestion(auth.user, existing)) {
          return json({ error: "FORBIDDEN_QUESTION_EDIT" }, 403);
        }
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid question update" }, 400);
        const patch = body;
        const { ownerId: _owner, createdBy: _creator, sharedWith: _shares, id: _id, createdAt: _created, updatedAt: _updated, ...safePatch } = patch;
        const nextGrade = typeof safePatch.grade === "string" ? safePatch.grade : existingGrade;
        const nextSubject = typeof safePatch.subjectId === "string" ? safePatch.subjectId : existingSubject;
        if (!canAccessQuestionScope(auth.user, nextGrade, nextSubject)) {
          return json({ error: "FORBIDDEN_ACADEMIC_SCOPE" }, 403);
        }
        if (safePatch.questionText !== void 0 && (typeof safePatch.questionText !== "string" || !safePatch.questionText.trim()) || safePatch.modelAnswer !== void 0 && (typeof safePatch.modelAnswer !== "string" || !safePatch.modelAnswer.trim())) {
          return json({ error: "Question text and model answer cannot be empty" }, 400);
        }
        const updatedAt = (/* @__PURE__ */ new Date()).toISOString();
        const updated = {
          ...existing,
          ...safePatch,
          id: questionId,
          ownerId: existing.ownerId,
          updatedAt
        };
        const saved = await env.DB.prepare(
          "UPDATE questions SET subject_id = ?, grade = ?, unit_id = ?, record_json = ?, updated_at = ? WHERE id = ?"
        ).bind(
          nextSubject,
          nextGrade,
          typeof updated.unitId === "string" ? updated.unitId : null,
          JSON.stringify(updated),
          updatedAt,
          questionId
        ).run();
        if (!saved.success) return json({ error: "Question could not be updated" }, 503);
        return json({ success: true, question: updated });
      } catch (error) {
        console.error("Worker question mutation failed", error);
        return json({ error: "Question operation failed" }, 500);
      }
    }
    if (url.pathname === "/api/worker/catalog/subjects" && request.method === "GET") {
      if (!env.DB) return json({ error: "Catalog unavailable" }, 503);
      try {
        const activeOnly = url.searchParams.get("active") === "true";
        const result = activeOnly ? await env.DB.prepare("SELECT record_json FROM subjects WHERE is_active = 1 ORDER BY sort_order ASC").all() : await env.DB.prepare("SELECT record_json FROM subjects ORDER BY sort_order ASC").all();
        if (!result.success) return json({ error: "Catalog unavailable" }, 503);
        const subjects = (result.results || []).map((row) => {
          const value = JSON.parse(row.record_json);
          if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Malformed subject record");
          return value;
        });
        return json(subjects);
      } catch (error) {
        console.error("Worker subject catalog read failed", error);
        return json({ error: "Catalog unavailable" }, 500);
      }
    }
    if (url.pathname.startsWith("/api/worker/catalog/subjects") && ["POST", "PUT", "DELETE"].includes(request.method)) {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      try {
        const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, new D1AuthVersionReader(env.DB), new D1UserRepository(env.DB));
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const actor = auth.user;
        if (!["PlatformOwner", "Administrator", "SchoolAdmin"].includes(String(actor.role))) return json({ error: "FORBIDDEN" }, 403);
        const subjectPermissions = actor.delegatedPermissions && typeof actor.delegatedPermissions === "object" ? actor.delegatedPermissions : {};
        if (String(actor.role) === "SchoolAdmin" && subjectPermissions.canManageSubjects === false) return json({ error: "FORBIDDEN_SUBJECT_MANAGEMENT" }, 403);
        const tail = url.pathname.slice("/api/worker/catalog/subjects".length).replace(/^\/+/, "");
        if (request.method === "POST" && !tail) {
          const body2 = await request.json().catch(() => null);
          if (!body2 || typeof body2 !== "object" || Array.isArray(body2)) return json({ error: "Invalid subject" }, 400);
          const input = body2;
          if (typeof input.nameAr !== "string" || !input.nameAr.trim() || typeof input.nameEn !== "string" || !input.nameEn.trim()) return json({ error: "Subject names are required" }, 400);
          const id2 = typeof input.id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(input.id) ? input.id : "subj-" + crypto.randomUUID();
          const subject = {
            ...input,
            id: id2,
            code: typeof input.code === "string" ? input.code : String(input.nameEn).slice(0, 3).toUpperCase(),
            defaultDirection: input.defaultDirection === "ltr" ? "ltr" : "rtl",
            isActive: input.isActive !== false,
            sortOrder: Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : 99,
            createdAt: (/* @__PURE__ */ new Date()).toISOString()
          };
          const result = await env.DB.prepare("INSERT INTO subjects (id,is_active,sort_order,record_json) VALUES (?,?,?,?)").bind(id2, subject.isActive ? 1 : 0, subject.sortOrder, JSON.stringify(subject)).run();
          return result.success ? json({ success: true, subject }) : json({ error: "SUBJECT_SAVE_FAILED" }, 503);
        }
        const id = tail.split("/")[0];
        if (!id || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) return json({ error: "Invalid subject id" }, 400);
        const row = await env.DB.prepare("SELECT record_json FROM subjects WHERE id=? LIMIT 1").bind(id).first();
        if (!row) return json({ error: "SUBJECT_NOT_FOUND" }, 404);
        const existing = JSON.parse(row.record_json);
        if (request.method === "DELETE") {
          if (["subj-quran", "subj-isl", "subj-ar", "subj-sci", "subj-soc", "subj-en"].includes(id)) return json({ error: "CORE_SUBJECT_CANNOT_BE_DELETED" }, 400);
          const removed = await env.DB.prepare("DELETE FROM subjects WHERE id=?").bind(id).run();
          return removed.success ? json({ success: true }) : json({ error: "SUBJECT_DELETE_FAILED" }, 503);
        }
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid subject update" }, 400);
        const patch = body;
        const { id: _id, ...safe } = patch;
        const updated = {
          ...existing,
          ...safe,
          id,
          isActive: safe.isActive === void 0 ? existing.isActive : safe.isActive !== false,
          sortOrder: safe.sortOrder === void 0 ? existing.sortOrder : Number(safe.sortOrder)
        };
        const saved = await env.DB.prepare("UPDATE subjects SET is_active=?,sort_order=?,record_json=? WHERE id=?").bind(updated.isActive ? 1 : 0, Number(updated.sortOrder) || 99, JSON.stringify(updated), id).run();
        return saved.success ? json({ success: true, subject: updated }) : json({ error: "SUBJECT_UPDATE_FAILED" }, 503);
      } catch (e) {
        console.error("Worker subject mutation failed", e);
        return json({ error: "Subject operation failed" }, 500);
      }
    }
    const curriculumCollection = "/api/worker/curricula";
    const curriculumPrefix = "/api/worker/curricula/unit/";
    if (url.pathname === curriculumCollection && request.method === "GET") {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      try {
        const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, new D1AuthVersionReader(env.DB), new D1UserRepository(env.DB));
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const grade = url.searchParams.get("grade") || "", subjectId = url.searchParams.get("subjectId") || "";
        const user = auth.user;
        const admin = ["PlatformOwner", "Administrator", "SchoolAdmin"].includes(String(user.role));
        const grades = Array.isArray(user.assignedGrades) ? user.assignedGrades.map(String) : [];
        const subjects = Array.isArray(user.assignedSubjects) ? user.assignedSubjects.map(String) : [];
        if (grade && !admin && !(grades.includes("all") || grades.includes(grade)) || subjectId && !admin && !(subjects.includes("all") || subjects.includes(subjectId))) return json({ error: "FORBIDDEN_ACADEMIC_SCOPE" }, 403);
        const existingCount = await env.DB.prepare("SELECT COUNT(*) AS total FROM curricula").first();
        if (Number(existingCount?.total || 0) === 0) {
          for (const seedUnit of DEFAULT_CURRICULA) {
            const unit = { ...seedUnit, subjectId: typeof seedUnit.subjectId === "string" ? seedUnit.subjectId : "subj-en" };
            await env.DB.prepare("INSERT OR IGNORE INTO curricula (id,grade,subject_id,record_json) VALUES (?,?,?,?)").bind(String(unit.id), String(unit.grade), String(unit.subjectId), JSON.stringify(unit)).run();
          }
        }
        const r = await env.DB.prepare("SELECT record_json FROM curricula ORDER BY grade, subject_id, id").all();
        if (!r.success) return json({ error: "Curriculum unavailable" }, 503);
        const list = (r.results || []).flatMap((row) => {
          try {
            const v = JSON.parse(row.record_json);
            if (grade && v.grade !== grade) return [];
            if (subjectId && String(v.subjectId || "subj-en") !== subjectId) return [];
            if (!admin && (!(grades.includes("all") || grades.includes(String(v.grade || ""))) || !(subjects.includes("all") || subjects.includes(String(v.subjectId || "subj-en"))))) return [];
            return [v];
          } catch {
            return [];
          }
        });
        return json(list);
      } catch (e) {
        console.error("Worker curricula read failed", e);
        return json({ error: "Curriculum unavailable" }, 500);
      }
    }
    if (url.pathname === curriculumCollection + "/reset" && request.method === "POST") {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      try {
        const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, new D1AuthVersionReader(env.DB), new D1UserRepository(env.DB));
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        if (String(auth.user.role) !== "PlatformOwner") return json({ error: "FORBIDDEN" }, 403);
        const removed = await env.DB.prepare("DELETE FROM curricula").run();
        if (!removed.success) return json({ error: "CURRICULUM_RESET_FAILED" }, 503);
        for (const seedUnit of DEFAULT_CURRICULA) {
          const unit = { ...seedUnit, subjectId: typeof seedUnit.subjectId === "string" ? seedUnit.subjectId : "subj-en" };
          const inserted = await env.DB.prepare("INSERT INTO curricula (id,grade,subject_id,record_json) VALUES (?,?,?,?)").bind(String(unit.id), String(unit.grade), String(unit.subjectId), JSON.stringify(unit)).run();
          if (!inserted.success) return json({ error: "CURRICULUM_RESET_PARTIAL" }, 503);
        }
        return json({ success: true, message: "Curriculum restored to the canonical starter dataset" });
      } catch (e) {
        console.error("Worker curriculum reset failed", e);
        return json({ error: "Curriculum reset failed" }, 500);
      }
    }
    if (url.pathname === curriculumCollection + "/unit" && request.method === "POST") {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      try {
        const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, new D1AuthVersionReader(env.DB), new D1UserRepository(env.DB));
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const curriculumActor = auth.user;
        if (!["PlatformOwner", "Administrator", "SchoolAdmin"].includes(String(curriculumActor.role))) return json({ error: "FORBIDDEN" }, 403);
        const curriculumPermissions = curriculumActor.delegatedPermissions && typeof curriculumActor.delegatedPermissions === "object" ? curriculumActor.delegatedPermissions : {};
        if (String(curriculumActor.role) === "SchoolAdmin" && curriculumPermissions.canManageCurricula === false) return json({ error: "FORBIDDEN_CURRICULUM_MANAGEMENT" }, 403);
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid curriculum unit" }, 400);
        const input = body;
        if (typeof input.title !== "string" || !input.title.trim() || typeof input.grade !== "string" || !input.grade.trim()) return json({ error: "Title and grade are required" }, 400);
        const id = typeof input.id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(input.id) ? input.id : "unit-" + crypto.randomUUID();
        const unit = { ...input, id, lessons: Array.isArray(input.lessons) ? input.lessons : [] };
        const r = await env.DB.prepare("INSERT INTO curricula (id,grade,subject_id,record_json) VALUES (?,?,?,?)").bind(id, String(unit.grade), String(unit.subjectId || "subj-en"), JSON.stringify(unit)).run();
        return r.success ? json({ success: true, unit }) : json({ error: "CURRICULUM_SAVE_FAILED" }, 503);
      } catch (e) {
        console.error("Worker curriculum create failed", e);
        return json({ error: "Curriculum save failed" }, 500);
      }
    }
    const curriculumId = url.pathname.startsWith(curriculumPrefix) ? url.pathname.slice(curriculumPrefix.length) : "";
    if (curriculumId && /^[A-Za-z0-9_-]{1,128}$/.test(curriculumId) && ["PUT", "DELETE"].includes(request.method)) {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      try {
        const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, new D1AuthVersionReader(env.DB), new D1UserRepository(env.DB));
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const curriculumActor = auth.user;
        if (!["PlatformOwner", "Administrator", "SchoolAdmin"].includes(String(curriculumActor.role))) return json({ error: "FORBIDDEN" }, 403);
        const curriculumPermissions = curriculumActor.delegatedPermissions && typeof curriculumActor.delegatedPermissions === "object" ? curriculumActor.delegatedPermissions : {};
        if (String(curriculumActor.role) === "SchoolAdmin" && curriculumPermissions.canManageCurricula === false) return json({ error: "FORBIDDEN_CURRICULUM_MANAGEMENT" }, 403);
        const row = await env.DB.prepare("SELECT record_json FROM curricula WHERE id=? LIMIT 1").bind(curriculumId).first();
        if (!row) return json({ error: "CURRICULUM_NOT_FOUND" }, 404);
        if (request.method === "DELETE") {
          const d = await env.DB.prepare("DELETE FROM curricula WHERE id=?").bind(curriculumId).run();
          return d.success ? json({ success: true }) : json({ error: "CURRICULUM_DELETE_FAILED" }, 503);
        }
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid curriculum update" }, 400);
        const current = JSON.parse(row.record_json);
        const patch = body;
        const { id: _id, ...safe } = patch;
        const next = { ...current, ...safe, id: curriculumId };
        const nextGrade = typeof next.grade === "string" ? next.grade : "";
        const nextSubject = typeof next.subjectId === "string" && next.subjectId ? next.subjectId : "subj-en";
        if (!nextGrade.trim()) return json({ error: "Invalid curriculum grade" }, 400);
        const u = await env.DB.prepare("UPDATE curricula SET grade=?,subject_id=?,record_json=? WHERE id=?").bind(nextGrade, nextSubject, JSON.stringify(next), curriculumId).run();
        return u.success ? json({ success: true, unit: next }) : json({ error: "CURRICULUM_UPDATE_FAILED" }, 503);
      } catch (e) {
        console.error("Worker curriculum mutation failed", e);
        return json({ error: "Curriculum operation failed" }, 500);
      }
    }
    if (url.pathname === "/api/worker/notifications" && request.method === "GET") {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      try {
        const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, new D1AuthVersionReader(env.DB), new D1UserRepository(env.DB));
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const r = await env.DB.prepare("SELECT id,record_json FROM notifications WHERE user_id=? OR user_id IS NULL ORDER BY created_at DESC LIMIT 200").bind(auth.user.id).all();
        if (!r.success) return json({ error: "Notifications unavailable" }, 503);
        const list = (r.results || []).flatMap((row) => {
          try {
            const n = JSON.parse(row.record_json);
            const readBy = Array.isArray(n.readBy) ? n.readBy.map(String) : [];
            return [{ ...n, readBy }];
          } catch {
            return [];
          }
        });
        return json({ notifications: list, unreadCount: list.filter((n) => !n.readBy.includes(String(auth.user.id))).length });
      } catch (e) {
        console.error("Worker notifications read failed", e);
        return json({ error: "Notifications unavailable" }, 500);
      }
    }
    const notificationReadMatch = url.pathname.match(/^\/api\/worker\/notifications\/([A-Za-z0-9_-]{1,128})\/read$/);
    if (notificationReadMatch && request.method === "POST") {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      try {
        const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, new D1AuthVersionReader(env.DB), new D1UserRepository(env.DB));
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const id = notificationReadMatch[1];
        const row = await env.DB.prepare("SELECT record_json FROM notifications WHERE id=? AND (user_id=? OR user_id IS NULL) LIMIT 1").bind(id, auth.user.id).first();
        if (!row) return json({ error: "NOTIFICATION_NOT_FOUND" }, 404);
        const n = JSON.parse(row.record_json);
        const readBy = Array.isArray(n.readBy) ? n.readBy.map(String) : [];
        if (!readBy.includes(String(auth.user.id))) readBy.push(String(auth.user.id));
        n.readBy = readBy;
        const u = await env.DB.prepare("UPDATE notifications SET record_json=? WHERE id=?").bind(JSON.stringify(n), id).run();
        return u.success ? json({ success: true }) : json({ error: "NOTIFICATION_UPDATE_FAILED" }, 503);
      } catch (e) {
        console.error("Worker notification read update failed", e);
        return json({ error: "Notification update failed" }, 500);
      }
    }
    if (url.pathname === "/api/worker/notifications/read-all" && request.method === "POST") {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      try {
        const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, new D1AuthVersionReader(env.DB), new D1UserRepository(env.DB));
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const r = await env.DB.prepare("SELECT id,record_json FROM notifications WHERE user_id=? OR user_id IS NULL ORDER BY created_at DESC LIMIT 200").bind(auth.user.id).all();
        let updatedCount = 0;
        for (const row of r.results || []) {
          try {
            const n = JSON.parse(row.record_json);
            const reads = Array.isArray(n.readBy) ? n.readBy.map(String) : [];
            if (!reads.includes(String(auth.user.id))) {
              reads.push(String(auth.user.id));
              n.readBy = reads;
              const u = await env.DB.prepare("UPDATE notifications SET record_json=? WHERE id=?").bind(JSON.stringify(n), row.id).run();
              if (u.success) updatedCount++;
            }
          } catch {
          }
        }
        return json({ success: true, updatedCount });
      } catch (e) {
        console.error("Worker mark all notifications failed", e);
        return json({ error: "Notifications unavailable" }, 500);
      }
    }
    if (url.pathname === "/api/worker/school/identity" && request.method === "PUT") {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      try {
        const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, new D1AuthVersionReader(env.DB), new D1UserRepository(env.DB));
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const actor = auth.user;
        if (!["PlatformOwner", "Administrator", "SchoolAdmin"].includes(String(actor.role))) return json({ error: "FORBIDDEN" }, 403);
        const identityPermissions = actor.delegatedPermissions && typeof actor.delegatedPermissions === "object" ? actor.delegatedPermissions : {};
        if (String(actor.role) === "SchoolAdmin" && identityPermissions.canManageIdentity === false) return json({ error: "FORBIDDEN_IDENTITY_MANAGEMENT" }, 403);
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid school identity" }, 400);
        const current = await env.DB.prepare("SELECT record_json FROM school_settings WHERE singleton_id=1").first();
        const old = current ? JSON.parse(current.record_json) : {};
        const patch = body;
        const next = { ...old, ...patch, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
        const saved = await env.DB.prepare("INSERT INTO school_settings (singleton_id,record_json,updated_at) VALUES (1,?,?) ON CONFLICT(singleton_id) DO UPDATE SET record_json=excluded.record_json,updated_at=excluded.updated_at").bind(JSON.stringify(next), String(next.updatedAt)).run();
        return saved.success ? json({ success: true, settings: next }) : json({ error: "SCHOOL_IDENTITY_SAVE_FAILED" }, 503);
      } catch (e) {
        console.error("Worker school identity update failed", e);
        return json({ error: "School identity update failed" }, 500);
      }
    }
    if (url.pathname === "/api/worker/school/identity" && request.method === "GET") {
      if (!env.DB) return json({ error: "School identity unavailable" }, 503);
      try {
        const row = await env.DB.prepare("SELECT record_json FROM school_settings WHERE singleton_id = 1").first();
        const defaults = {
          schoolNameAr: "\u0645\u062F\u0631\u0633\u0629 \u0642\u0641\u0644\u0629 \u0644\u0644\u062A\u0639\u0644\u064A\u0645 \u0627\u0644\u0623\u0633\u0627\u0633\u064A",
          schoolNameEn: "QAFLAH SCHOOL",
          countryTitleAr: "\u0627\u0644\u062C\u0645\u0647\u0648\u0631\u064A\u0629 \u0627\u0644\u064A\u0645\u0646\u064A\u0629",
          countryTitleEn: "Republic of Yemen",
          ministryTitleAr: "\u0648\u0632\u0627\u0631\u0629 \u0627\u0644\u062A\u0631\u0628\u064A\u0629 \u0648\u0627\u0644\u062A\u0639\u0644\u064A\u0645",
          ministryTitleEn: "Ministry of Education",
          logoUrl: "/assets/aistudio/1793675145730_f04991e4.jpg",
          primaryColor: "#1B5E3A",
          defaultAcademicYear: "2026 / 2027",
          defaultTerm: "\u0627\u0644\u0641\u0635\u0644 \u0627\u0644\u062F\u0631\u0627\u0633\u064A \u0627\u0644\u0623\u0648\u0644",
          defaultShowTeacherName: true,
          defaultHeaderLanguage: "ar",
          defaultHeaderCompact: false,
          footerNoteAr: "\u0645\u062F\u0631\u0633\u0629 \u0642\u0641\u0644\u0629 \u0644\u0644\u062A\u0639\u0644\u064A\u0645 \u0627\u0644\u0623\u0633\u0627\u0633\u064A \u2013 \u0627\u0644\u062C\u0645\u0647\u0648\u0631\u064A\u0629 \u0627\u0644\u064A\u0645\u0646\u064A\u0629",
          footerNoteEn: "QAFLAH BASIC EDUCATION SCHOOL - YEMEN"
        };
        if (!row) return json(defaults);
        const stored = JSON.parse(row.record_json);
        if (!stored || typeof stored !== "object" || Array.isArray(stored)) throw new Error("Malformed school identity");
        return json({ ...defaults, ...stored });
      } catch (error) {
        console.error("Worker school identity read failed", error);
        return json({ error: "School identity unavailable" }, 500);
      }
    }
    const userCollection = "/api/worker/system/users";
    if ((url.pathname === userCollection || url.pathname === "/api/worker/system/colleagues") && request.method === "GET") {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      try {
        const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, new D1AuthVersionReader(env.DB), new D1UserRepository(env.DB));
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const actor = auth.user;
        if (!["PlatformOwner", "Administrator", "SchoolAdmin"].includes(String(actor.role))) return json({ error: "FORBIDDEN" }, 403);
        const userPermissions = actor.delegatedPermissions && typeof actor.delegatedPermissions === "object" ? actor.delegatedPermissions : {};
        if (String(actor.role) === "SchoolAdmin" && userPermissions.canManageTeachers === false) return json({ error: "FORBIDDEN_USER_MANAGEMENT" }, 403);
        const r = await env.DB.prepare("SELECT record_json FROM app_users ORDER BY created_at").all();
        if (!r.success) return json({ error: "User directory unavailable" }, 503);
        const users = (r.results || []).flatMap((row) => {
          try {
            const value = JSON.parse(row.record_json);
            const { passwordHash: _passwordHash, authVersion: _authVersion, ...safe } = value;
            return [url.pathname.endsWith("/colleagues") ? { id: safe.id, name: safe.name, username: safe.username, role: safe.role } : safe];
          } catch {
            return [];
          }
        });
        return json(users);
      } catch (e) {
        console.error("Worker user directory failed", e);
        return json({ error: "User directory unavailable" }, 500);
      }
    }
    if (url.pathname === userCollection && request.method === "POST") {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      try {
        const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, new D1AuthVersionReader(env.DB), new D1UserRepository(env.DB));
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const actor = auth.user;
        const role = String(actor.role);
        if (!["PlatformOwner", "Administrator", "SchoolAdmin"].includes(role)) return json({ error: "FORBIDDEN" }, 403);
        const userPermissions = actor.delegatedPermissions && typeof actor.delegatedPermissions === "object" ? actor.delegatedPermissions : {};
        if (role === "SchoolAdmin" && userPermissions.canManageTeachers === false) return json({ error: "FORBIDDEN_USER_MANAGEMENT" }, 403);
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid user data" }, 400);
        const input = body;
        const username = typeof input.username === "string" ? input.username.trim() : "";
        const name = typeof input.name === "string" ? input.name.trim() : "";
        const password = typeof input.password === "string" ? input.password : "";
        if (!/^[A-Za-z0-9._-]{3,32}$/.test(username) || name.length < 3 || name.length > 120 || password.length < 8 || password.length > 128) return json({ error: "Invalid username, name, or password" }, 400);
        const requested = input.role === "PlatformOwner" ? "PlatformOwner" : input.role === "Administrator" ? "Administrator" : input.role === "SchoolAdmin" ? "SchoolAdmin" : "Teacher";
        if (["PlatformOwner", "Administrator", "SchoolAdmin"].includes(requested) && role !== "PlatformOwner") return json({ error: "Only the platform owner may create privileged accounts" }, 403);
        const subjects = Array.isArray(input.assignedSubjects) ? input.assignedSubjects.filter((x) => typeof x === "string") : [];
        const grades = Array.isArray(input.assignedGrades) ? input.assignedGrades.filter((x) => typeof x === "string") : [];
        if (requested === "Teacher") {
          const [subjectRows] = await Promise.all([env.DB.prepare("SELECT record_json FROM subjects WHERE is_active=1").all()]);
          const valid = new Set((subjectRows.results || []).flatMap((row) => {
            try {
              return [String(JSON.parse(row.record_json).id)];
            } catch {
              return [];
            }
          }));
          if (!subjects.length || subjects.includes("all") || !subjects.every((x) => valid.has(x)) || !grades.length || grades.includes("all") || !grades.every((x) => /^Grade [1-9]$/.test(x))) return json({ error: "Invalid teacher assignments" }, 400);
        }
        const existing = await env.DB.prepare("SELECT id FROM app_users WHERE username=? COLLATE NOCASE LIMIT 1").bind(username).first();
        if (existing) return json({ error: "USERNAME_ALREADY_EXISTS" }, 409);
        const schoolRow = await env.DB.prepare("SELECT record_json FROM school_settings WHERE singleton_id=1").first();
        const school = schoolRow ? JSON.parse(schoolRow.record_json) : {};
        const now = (/* @__PURE__ */ new Date()).toISOString(), id = "usr-" + crypto.randomUUID();
        const user = {
          id,
          username,
          name,
          role: requested,
          status: "ACTIVE",
          hasAIAccess: role === "PlatformOwner" && requested === "PlatformOwner" && input.hasAIAccess === true,
          assignedSubjects: requested === "Teacher" ? subjects : ["all"],
          assignedGrades: requested === "Teacher" ? grades : ["all"],
          email: typeof input.email === "string" ? input.email.slice(0, 254) : void 0,
          phone: typeof input.phone === "string" ? input.phone.slice(0, 40) : void 0,
          school: typeof school.schoolNameAr === "string" ? school.schoolNameAr : "\u0645\u062F\u0631\u0633\u0629 \u0642\u0641\u0644\u0629 \u0644\u0644\u062A\u0639\u0644\u064A\u0645 \u0627\u0644\u0623\u0633\u0627\u0633\u064A",
          reviewedBy: actor.id,
          reviewedByName: actor.name,
          reviewedAt: now,
          createdAt: now,
          passwordHash: await bcryptjs_default.hash(password, 10),
          authVersion: 0
        };
        const inserted = await env.DB.prepare("INSERT INTO app_users (id,username,role,status,record_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?)").bind(id, username, requested, "ACTIVE", JSON.stringify(user), now, now).run();
        if (!inserted.success) return json({ error: "USER_CREATE_FAILED" }, 503);
        const { passwordHash: _hash2, authVersion: _version, ...safe } = user;
        return json({ success: true, user: safe });
      } catch (e) {
        console.error("Worker user create failed", e);
        return json({ error: "User creation failed" }, 500);
      }
    }
    const userItemPrefix = "/api/worker/system/users/";
    const userItemId = url.pathname.startsWith(userItemPrefix) ? url.pathname.slice(userItemPrefix.length) : "";
    if (userItemId && /^[A-Za-z0-9_-]{1,128}$/.test(userItemId) && request.method === "PUT") {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      try {
        const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, new D1AuthVersionReader(env.DB), new D1UserRepository(env.DB));
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const actor = auth.user, actorRole = String(actor.role);
        if (!["PlatformOwner", "Administrator", "SchoolAdmin"].includes(actorRole)) return json({ error: "FORBIDDEN" }, 403);
        const userPermissions = actor.delegatedPermissions && typeof actor.delegatedPermissions === "object" ? actor.delegatedPermissions : {};
        if (actorRole === "SchoolAdmin" && userPermissions.canManageTeachers === false) return json({ error: "FORBIDDEN_USER_MANAGEMENT" }, 403);
        const row = await env.DB.prepare("SELECT record_json FROM app_users WHERE id=? LIMIT 1").bind(userItemId).first();
        if (!row) return json({ error: "USER_NOT_FOUND" }, 404);
        const target = JSON.parse(row.record_json);
        if (["PlatformOwner", "Administrator"].includes(String(target.role)) && actorRole !== "PlatformOwner") return json({ error: "OWNER_ACCOUNT_PROTECTED" }, 403);
        if (actorRole === "SchoolAdmin" && String(target.role) !== "Teacher") return json({ error: "SCHOOL_ADMIN_CAN_ONLY_MANAGE_TEACHERS" }, 403);
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid user update" }, 400);
        const input = body, allowed = ["name", "role", "status", "hasAIAccess", "assignedSubjects", "assignedGrades", "email", "phone", "school", "reviewNotes", "delegatedPermissions"];
        const patch = {};
        for (const key of allowed) if (Object.prototype.hasOwnProperty.call(input, key)) patch[key] = input[key];
        if (actorRole !== "PlatformOwner") {
          delete patch.hasAIAccess;
          delete patch.delegatedPermissions;
          delete patch.status;
          if (patch.role === "PlatformOwner" || patch.role === "Administrator" || patch.role === "SchoolAdmin" && target.role !== "SchoolAdmin") return json({ error: "PRIVILEGE_ESCALATION_BLOCKED" }, 403);
        }
        const nextRole = String(patch.role || target.role);
        if (nextRole === "Teacher") {
          const subjects = Array.isArray(patch.assignedSubjects) ? patch.assignedSubjects : target.assignedSubjects;
          const grades = Array.isArray(patch.assignedGrades) ? patch.assignedGrades : target.assignedGrades;
          if (!Array.isArray(subjects) || !subjects.length || subjects.includes("all") || !Array.isArray(grades) || !grades.length || grades.includes("all") || !grades.every((x) => typeof x === "string" && /^Grade [1-9]$/.test(x))) return json({ error: "Invalid teacher assignments" }, 400);
          patch.hasAIAccess = false;
        }
        const updated = { ...target, ...patch, id: userItemId, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
        const saved = await env.DB.prepare("UPDATE app_users SET role=?,status=?,record_json=?,updated_at=? WHERE id=?").bind(String(updated.role), String(updated.status), JSON.stringify(updated), String(updated.updatedAt), userItemId).run();
        if (!saved.success) return json({ error: "USER_UPDATE_FAILED" }, 503);
        const { passwordHash: _hash2, authVersion: _version, ...safe } = updated;
        return json({ success: true, user: safe });
      } catch (e) {
        console.error("Worker user update failed", e);
        return json({ error: "User update failed" }, 500);
      }
    }
    const aiModels = [
      { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash (\u0627\u0644\u0645\u0648\u062F\u064A\u0644 \u0627\u0644\u0645\u0648\u0635\u0649 \u0628\u0647)", isFreeTier: true, description: "\u0633\u0631\u064A\u0639 \u0644\u062A\u0648\u0644\u064A\u062F \u0648\u0641\u062D\u0635 \u0627\u0644\u0627\u062E\u062A\u0628\u0627\u0631\u0627\u062A \u0627\u0644\u0645\u062F\u0631\u0633\u064A\u0629." },
      { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite (\u0627\u0644\u0627\u062D\u062A\u064A\u0627\u0637\u064A \u0627\u0644\u0633\u0631\u064A\u0639)", isFreeTier: true, description: "\u062E\u064A\u0627\u0631 \u0627\u062D\u062A\u064A\u0627\u0637\u064A \u0633\u0631\u064A\u0639 \u0648\u0627\u0642\u062A\u0635\u0627\u062F\u064A." }
    ];
    const aiDefaults = {
      apiKeyConfigured: Boolean(env.GEMINI_API_KEY),
      primaryModel: "gemini-3.8-flash",
      fallbackModel: "gemini-3.1-flash-lite",
      allowPaidModels: false,
      temperature: 0.3,
      totalRequests: 0,
      activeStatus: env.GEMINI_API_KEY ? "Configured" : "NotConfigured"
    };
    const aiAccess = /* @__PURE__ */ __name(async (request2) => {
      const auth = await authenticateWorkerRequest(request2, env.SESSION_SECRET, new D1AuthVersionReader(env.DB), new D1UserRepository(env.DB));
      if (!auth.ok) return { auth, allowed: false, userId: "" };
      const user = auth.user;
      return { auth, allowed: user.hasAIAccess === true && ["PlatformOwner", "Administrator"].includes(String(user.role)), userId: String(user.id) };
    }, "aiAccess");
    const readAISettings = /* @__PURE__ */ __name(async () => {
      const row = await env.DB.prepare("SELECT record_json FROM ai_settings WHERE singleton_id=1").first();
      let stored = {};
      if (row) {
        try {
          stored = JSON.parse(row.record_json);
        } catch {
        }
      }
      return { ...aiDefaults, ...stored, apiKeyConfigured: Boolean(env.GEMINI_API_KEY) };
    }, "readAISettings");
    const writeAILog = /* @__PURE__ */ __name(async (userId, operation, model, status, promptSnippet, durationMs, errorMessage) => {
      const createdAt = (/* @__PURE__ */ new Date()).toISOString(), id = "ai-log-" + crypto.randomUUID();
      const log = { id, timestamp: createdAt, userId, operation, model, status, promptSnippet: promptSnippet.slice(0, 500), durationMs, errorMessage: errorMessage?.slice(0, 500) };
      await env.DB.prepare("INSERT INTO ai_usage_logs (id,user_id,created_at,record_json) VALUES (?,?,?,?)").bind(id, userId, createdAt, JSON.stringify(log)).run();
      const settings = await readAISettings();
      settings.totalRequests = Number(settings.totalRequests || 0) + 1;
      await env.DB.prepare("INSERT INTO ai_settings (singleton_id,record_json,updated_at) VALUES (1,?,?) ON CONFLICT(singleton_id) DO UPDATE SET record_json=excluded.record_json,updated_at=excluded.updated_at").bind(JSON.stringify(settings), createdAt).run();
    }, "writeAILog");
    const generateGemini = /* @__PURE__ */ __name(async (model, prompt, temperature = 0.3) => {
      if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");
      const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(env.GEMINI_API_KEY);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature } })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error("Gemini request failed with status " + response.status);
      const candidates = payload?.candidates;
      const first = Array.isArray(candidates) ? candidates[0] : null;
      const content = first?.content;
      const parts = Array.isArray(content?.parts) ? content?.parts : [];
      const textValue = parts.map((p) => typeof p.text === "string" ? p.text : "").join("");
      if (!textValue) throw new Error("Gemini returned an empty response");
      return textValue;
    }, "generateGemini");
    if (url.pathname === "/api/worker/ai/settings" && request.method === "GET") {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      const check = await aiAccess(request);
      if (!check.auth.ok) return json({ error: check.auth.error }, check.auth.status);
      if (!check.allowed) return json({ error: "AI_ACCESS_REQUIRED" }, 403);
      try {
        return json(await readAISettings());
      } catch (e) {
        console.error("AI settings read failed", e);
        return json({ error: "AI settings unavailable" }, 500);
      }
    }
    if (url.pathname === "/api/worker/ai/settings" && request.method === "POST") {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      const check = await aiAccess(request);
      if (!check.auth.ok) return json({ error: check.auth.error }, check.auth.status);
      if (!check.allowed) return json({ error: "AI_ACCESS_REQUIRED" }, 403);
      try {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid AI settings" }, 400);
        const input = body, current = await readAISettings(), patch = {};
        const allowedModels = new Set(aiModels.map((m) => m.id));
        if (input.primaryModel !== void 0) {
          if (typeof input.primaryModel !== "string" || !allowedModels.has(input.primaryModel)) return json({ error: "INVALID_PRIMARY_MODEL" }, 400);
          patch.primaryModel = input.primaryModel;
        }
        if (input.fallbackModel !== void 0) {
          if (typeof input.fallbackModel !== "string" || !allowedModels.has(input.fallbackModel)) return json({ error: "INVALID_FALLBACK_MODEL" }, 400);
          patch.fallbackModel = input.fallbackModel;
        }
        if (input.allowPaidModels !== void 0) {
          if (typeof input.allowPaidModels !== "boolean") return json({ error: "INVALID_MODEL_POLICY" }, 400);
          patch.allowPaidModels = input.allowPaidModels;
        }
        if (input.temperature !== void 0) {
          const n = Number(input.temperature);
          if (!Number.isFinite(n) || n < 0 || n > 2) return json({ error: "INVALID_TEMPERATURE" }, 400);
          patch.temperature = n;
        }
        const next = { ...current, ...patch, apiKeyConfigured: Boolean(env.GEMINI_API_KEY) };
        const at = (/* @__PURE__ */ new Date()).toISOString();
        const saved = await env.DB.prepare("INSERT INTO ai_settings (singleton_id,record_json,updated_at) VALUES (1,?,?) ON CONFLICT(singleton_id) DO UPDATE SET record_json=excluded.record_json,updated_at=excluded.updated_at").bind(JSON.stringify(next), at).run();
        return saved.success ? json({ success: true, settings: next }) : json({ error: "AI_SETTINGS_SAVE_FAILED" }, 503);
      } catch (e) {
        console.error("AI settings update failed", e);
        return json({ error: "AI settings update failed" }, 500);
      }
    }
    if (url.pathname === "/api/worker/ai/models" && request.method === "GET") {
      const check = await aiAccess(request);
      if (!check.auth.ok) return json({ error: check.auth.error }, check.auth.status);
      return check.allowed ? json(aiModels) : json({ error: "AI_ACCESS_REQUIRED" }, 403);
    }
    if (url.pathname === "/api/worker/ai/logs" && request.method === "GET") {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      const check = await aiAccess(request);
      if (!check.auth.ok) return json({ error: check.auth.error }, check.auth.status);
      if (!check.allowed) return json({ error: "AI_ACCESS_REQUIRED" }, 403);
      const r = await env.DB.prepare("SELECT record_json FROM ai_usage_logs ORDER BY created_at DESC LIMIT 200").all();
      return r.success ? json((r.results || []).flatMap((row) => {
        try {
          return [JSON.parse(row.record_json)];
        } catch {
          return [];
        }
      })) : json({ error: "AI logs unavailable" }, 503);
    }
    if (url.pathname === "/api/worker/ai/ping" && request.method === "POST") {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      const check = await aiAccess(request);
      if (!check.auth.ok) return json({ error: check.auth.error }, check.auth.status);
      if (!check.allowed) return json({ error: "AI_ACCESS_REQUIRED" }, 403);
      if (!env.GEMINI_API_KEY) return json({ success: false, model: "none", latencyMs: 0, message: "GEMINI_API_KEY is not configured" }, 503);
      const body = await request.json().catch(() => ({}));
      const model = body && typeof body === "object" && typeof body.model === "string" ? String(body.model) : String((await readAISettings()).primaryModel);
      if (!aiModels.some((m) => m.id === model)) return json({ error: "MODEL_NOT_ALLOWED" }, 400);
      const started = Date.now();
      try {
        await generateGemini(model, 'Reply only as JSON: {"status":"connected","service":"Gemini"}', 0);
        const latencyMs = Date.now() - started;
        await writeAILog(check.userId, "PING_TEST", model, "SUCCESS", "Connection test", latencyMs);
        return json({ success: true, model, latencyMs, message: "Gemini connection successful" });
      } catch (e) {
        const latencyMs = Date.now() - started;
        await writeAILog(check.userId, "PING_TEST", model, "ERROR", "Connection test", latencyMs, String(e));
        return json({ success: false, model, latencyMs, message: "Gemini connection failed" }, 502);
      }
    }
    const generateGeminiVision = /* @__PURE__ */ __name(async (model, prompt, images, temperature = 0.3) => {
      if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");
      const parts = [{ text: prompt }, ...images.map((img) => ({ inline_data: { mime_type: img.mimeType, data: img.data } }))];
      const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(env.GEMINI_API_KEY);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: "application/json", temperature } })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error("Gemini vision request failed with status " + response.status);
      const candidates = payload?.candidates;
      const first = Array.isArray(candidates) ? candidates[0] : null;
      const content = first?.content;
      const responseParts = Array.isArray(content?.parts) ? content?.parts : [];
      const textValue = responseParts.map((p) => typeof p.text === "string" ? p.text : "").join("");
      if (!textValue) throw new Error("Gemini returned an empty vision response");
      return textValue;
    }, "generateGeminiVision");
    if (url.pathname === "/api/worker/vision/analyze" && request.method === "POST") {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      const check = await aiAccess(request);
      if (!check.auth.ok) return json({ error: check.auth.error }, check.auth.status);
      if (!check.allowed) return json({ error: "AI_ACCESS_REQUIRED" }, 403);
      if (!env.GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY is not configured" }, 503);
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid vision request" }, 400);
      const input = body;
      const images = Array.isArray(input.images) ? input.images : [];
      if (!images.length || images.length > 8) return json({ error: "Provide between 1 and 8 images" }, 400);
      let total = 0;
      const valid = images.every((img) => {
        if (typeof img.dataUrl !== "string") return false;
        total += img.dataUrl.length;
        return /^data:image\/(png|jpeg|webp);base64,/i.test(img.dataUrl) && img.dataUrl.length <= 55e5;
      });
      if (!valid || total > 95e5) return json({ error: "Image payload is invalid or too large" }, 400);
      const normalized = images.map((img) => {
        const match = String(img.dataUrl).match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/i);
        return { mimeType: match?.[1] || "image/jpeg", data: match?.[2] || "" };
      });
      const model = String((await readAISettings()).primaryModel || aiModels[0].id), started = Date.now();
      const prompt = "Analyze these teacher-provided school worksheet or textbook images for a Yemeni English curriculum. Extract legible text in reading order. Return strict JSON with keys: documentTitle, detectedTopic, suggestedGrade (Grade 7/8/9), suggestedUnitTitle, suggestedUnits, rawText, rawExtractedText, grammarConcepts (array of concept, arabicName, ruleFormula, explanationEn, explanationAr, examples, commonMistakes), vocabulary (array of word, arabicTranslation, partOfSpeech, exampleSentence, phoneticHint), discoveredExercises (array of exerciseType, prompt, instructions, rawItems, items), readingPassages (array of title,text), extractedEntities (characters,locations,actions,relations), imageQualityReport (legible,score,handwritingDetected,blurDetected,cutoffDetected,illegibleSegments,warnings,notes). Never invent unreadable text; mark uncertainty in illegibleSegments. Expected grade: " + String(input.gradeHint || "Grade 7, Grade 8, or Grade 9") + ". Unit hint: " + String(input.unitHint || "").slice(0, 500) + ".";
      try {
        const raw = await generateGeminiVision(model, prompt, normalized, Number((await readAISettings()).temperature) || 0.3);
        const result = JSON.parse(raw);
        if (!Array.isArray(result.grammarConcepts)) result.grammarConcepts = [];
        if (!Array.isArray(result.vocabulary)) result.vocabulary = [];
        if (!Array.isArray(result.discoveredExercises)) result.discoveredExercises = [];
        if (!Array.isArray(result.suggestedUnits)) result.suggestedUnits = [];
        result.suggestedGrade = typeof result.suggestedGrade === "string" ? result.suggestedGrade : String(input.gradeHint || "Grade 7");
        result.analyzedAt = (/* @__PURE__ */ new Date()).toISOString();
        result.modelUsed = model;
        await writeAILog(check.userId, "VISION_ANALYZE", model, "SUCCESS", "Analyze " + images.length + " image(s)", Date.now() - started);
        return json({ success: true, result, modelUsed: model });
      } catch (e) {
        await writeAILog(check.userId, "VISION_ANALYZE", model, "ERROR", "Analyze " + images.length + " image(s)", Date.now() - started, String(e));
        return json({ error: "Image analysis failed" }, 502);
      }
    }
    if (url.pathname === "/api/worker/vision/generate-questions" && request.method === "POST") {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      const check = await aiAccess(request);
      if (!check.auth.ok) return json({ error: check.auth.error }, check.auth.status);
      if (!check.allowed) return json({ error: "AI_ACCESS_REQUIRED" }, 403);
      if (!env.GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY is not configured" }, 503);
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid question generation request" }, 400);
      const input = body, analysis = input.analysis;
      const grade = typeof input.grade === "string" ? input.grade : "";
      const contentScope = String(input.contentScope || "CURRICULUM_ENRICHMENT");
      const types = Array.isArray(input.selectedQuestionTypes) ? input.selectedQuestionTypes.map(String) : [];
      const count = Math.min(40, Math.max(1, Number(input.count) || 10));
      if (!analysis || !grade || !types.length) return json({ error: "Analysis, grade and question types are required" }, 400);
      if (String(input.subjectId || "subj-en") === "subj-quran") return json({ error: "AI generation is disabled for Quranic text" }, 400);
      const sourceText = [analysis.rawText, analysis.rawExtractedText, analysis.detectedTopic].filter((x) => typeof x === "string").join("\n").slice(0, 18e3);
      if (!sourceText.trim()) return json({ error: "Source analysis contains no readable text" }, 400);
      const model = String((await readAISettings()).primaryModel || aiModels[0].id), started = Date.now();
      const prompt = "Generate " + count + ' exam questions strictly grounded in this teacher-provided source. Do not introduce people, places, facts, grammar or answers not supported by the source. Return JSON only as {"questions":[...]}. Each question keys: questionText,instructions,type,difficulty,marks,options,matchingPairs,passage,scrambledWords,modelAnswer,explanation. Grade ' + grade + ". Allowed types: " + types.join(", ") + ". Educational level: " + String(input.educationalLevel || "BASIC") + ". Teacher notes: " + String(input.teacherNotes || "").slice(0, 1e3) + ". Source content:\n" + sourceText;
      try {
        const raw = await generateGemini(model, prompt, Number((await readAISettings()).temperature) || 0.3);
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed.questions) || !parsed.questions.length) throw new Error("No questions were returned");
        const questions = parsed.questions.slice(0, count).map((q, index) => ({
          ...q,
          id: "q-vision-" + crypto.randomUUID(),
          ownerId: check.userId,
          grade,
          unitId: "vision-generated",
          unitTitle: String(analysis.suggestedUnitTitle || ""),
          type: types.includes(String(q.type)) ? String(q.type) : types[index % types.length],
          difficulty: String(q.difficulty || "Medium"),
          marks: Number(q.marks) || 2,
          questionText: String(q.questionText || ""),
          modelAnswer: String(q.modelAnswer || ""),
          source: "Gemini AI",
          sourceCode: "IMAGE_SOURCE",
          educationalLevel: String(input.educationalLevel || "BASIC"),
          requiresTeacherReview: true,
          teacherReviewReason: "Generated from an image source; teacher review is required.",
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        }));
        if (questions.some((q) => !q.questionText.trim() || !q.modelAnswer.trim())) throw new Error("One or more generated questions are incomplete");
        if (input.saveToBank === true) {
          const user = check.auth.user;
          const assignedGrades = Array.isArray(user.assignedGrades) ? user.assignedGrades.map(String) : [];
          const assignedSubjects = Array.isArray(user.assignedSubjects) ? user.assignedSubjects.map(String) : [];
          if (!(assignedGrades.includes("all") || assignedGrades.includes(grade)) || !(assignedSubjects.includes("all") || assignedSubjects.includes(String(input.subjectId || "subj-en")))) return json({ error: "FORBIDDEN_ACADEMIC_SCOPE" }, 403);
          for (const q of questions) {
            await env.DB.prepare("INSERT INTO questions (id,owner_id,subject_id,grade,unit_id,record_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,NULL)").bind(q.id, check.userId, String(input.subjectId || "subj-en"), grade, q.unitId, JSON.stringify(q), String(q.createdAt)).run();
          }
        }
        await writeAILog(check.userId, "VISION_GENERATE_QUESTIONS", model, "SUCCESS", "Generate " + questions.length + " image-based questions", Date.now() - started);
        return json({ success: true, questions, modelUsed: model });
      } catch (e) {
        await writeAILog(check.userId, "VISION_GENERATE_QUESTIONS", model, "ERROR", "Generate image-based questions", Date.now() - started, String(e));
        return json({ error: "Image-based question generation failed" }, 502);
      }
    }
    if (url.pathname === "/api/worker/vision/validate-fidelity" && request.method === "POST") {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      const check = await aiAccess(request);
      if (!check.auth.ok) return json({ error: check.auth.error }, check.auth.status);
      if (!check.allowed) return json({ error: "AI_ACCESS_REQUIRED" }, 403);
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid fidelity request" }, 400);
      const input = body, question = input.question, analysis = input.analysis;
      if (!question || !analysis) return json({ error: "Question and analysis are required" }, 400);
      const source = [analysis.rawText, analysis.rawExtractedText, analysis.detectedTopic].filter((x) => typeof x === "string").join(" ").toLowerCase();
      const text = [question.questionText, question.modelAnswer, ...Array.isArray(question.options) ? question.options : []].filter((x) => typeof x === "string").join(" ").toLowerCase();
      const words = text.match(/[a-z]{3,}|[\u0600-\u06ff]{3,}/g) || [];
      const ignored = /* @__PURE__ */ new Set(["the", "and", "for", "with", "from", "this", "that", "what", "which", "where", "when", "your", "choose", "complete", "answer", "question"]);
      const meaningful = words.filter((x) => !ignored.has(x));
      const grounded = meaningful.filter((x) => source.includes(x));
      const foreign = meaningful.filter((x) => !source.includes(x));
      const score = meaningful.length ? Math.round(grounded.length / meaningful.length * 100) : 0;
      const passed = score >= 70;
      const validatedQuestion = {
        ...question,
        sourceFidelityScore: score,
        requiresTeacherReview: !passed || score < 85,
        teacherReviewReason: passed ? "Review the generated item before using it." : "Some question content is not clearly grounded in the supplied source.",
        groundedEntities: grounded,
        fidelityWarning: foreign.length ? "Some terms were not found in the source." : void 0
      };
      return json({
        success: true,
        score,
        passed,
        reclassified: false,
        requiresTeacherReview: !passed || score < 85,
        teacherReviewReason: validatedQuestion.teacherReviewReason,
        warning: validatedQuestion.fidelityWarning,
        acceptanceReason: passed ? "Most meaningful terms are present in the source." : "Insufficient source overlap; teacher review is required.",
        groundedEntities: grounded,
        foreignEntities: foreign,
        relationalPairsFound: [],
        metrics: { entityAccuracy: score, relationshipAccuracy: score, contextAccuracy: score, answerGrounding: score, semanticConsistency: score },
        validatedQuestion
      });
    }
    if (url.pathname === "/api/worker/exams/validate" && request.method === "POST") {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, new D1AuthVersionReader(env.DB), new D1UserRepository(env.DB));
      if (!auth.ok) return json({ error: auth.error }, auth.status);
      const body = await request.json().catch(() => null);
      const input = body && typeof body === "object" ? body : {};
      const sections = Array.isArray(input.sections) ? input.sections : [];
      const totalMarks = Number(input.totalMarks) || 20;
      const checks = [];
      const sum = sections.reduce((sum2, section) => sum2 + (Number(section.marks) || 0), 0);
      const questionCount = sections.reduce((sum2, section) => sum2 + (Array.isArray(section.questions) ? section.questions.length : 0), 0);
      const allQuestions = sections.flatMap((section) => Array.isArray(section.questions) ? section.questions : []);
      const missingAnswers = allQuestions.filter((q) => typeof q.modelAnswer !== "string" || !String(q.modelAnswer).trim()).length;
      const missingPrompts = allQuestions.filter((q) => typeof q.questionText !== "string" || !String(q.questionText).trim()).length;
      checks.push({ id: "sections", title: "Exam contains sections", passed: sections.length > 0, details: sections.length + " section(s)" });
      checks.push({ id: "questions", title: "Exam contains questions", passed: questionCount > 0, details: questionCount + " question(s)" });
      checks.push({ id: "marks", title: "Section marks match total marks", passed: sum === totalMarks, details: "Sections: " + sum + " / Exam: " + totalMarks });
      checks.push({ id: "answers", title: "All questions have model answers", passed: missingAnswers === 0, details: missingAnswers + " missing answer(s)" });
      checks.push({ id: "prompts", title: "All questions have question text", passed: missingPrompts === 0, details: missingPrompts + " missing prompt(s)" });
      const passed = checks.every((x) => x.passed);
      const warnings = checks.filter((x) => !x.passed).map((x) => x.details);
      const report = {
        passed,
        score: Math.round(checks.filter((x) => x.passed).length / checks.length * 100),
        checks,
        warnings,
        suggestions: passed ? [] : ["Review the failed checks before approving or printing the exam."]
      };
      return json(report);
    }
    if (url.pathname === "/api/worker/exams/generate-ai" && request.method === "POST") {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      const check = await aiAccess(request);
      if (!check.auth.ok) return json({ error: check.auth.error }, check.auth.status);
      if (!check.allowed) return json({ error: "AI_ACCESS_REQUIRED" }, 403);
      if (!env.GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY is not configured" }, 503);
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid exam generation request" }, 400);
      const input = body;
      const grade = typeof input.grade === "string" ? input.grade : "";
      const selectedUnits = Array.isArray(input.selectedUnits) ? input.selectedUnits.filter((x) => typeof x === "string") : [];
      const totalQuestions = Math.min(100, Math.max(1, Number(input.totalQuestions) || 20));
      const totalMarks = Math.min(300, Math.max(1, Number(input.totalMarks) || 20));
      if (!/^Grade [1-9]$/.test(grade) || !selectedUnits.length) return json({ error: "Grade and selected units are required" }, 400);
      const settings = await readAISettings(), model = String(settings.primaryModel || aiModels[0].id), started = Date.now();
      const curriculumRows = await env.DB.prepare("SELECT record_json FROM curricula WHERE grade=? AND subject_id=?").bind(grade, "subj-en").all();
      const curriculum = (curriculumRows.results || []).flatMap((row) => {
        try {
          return [JSON.parse(row.record_json)];
        } catch {
          return [];
        }
      });
      const context = curriculum.filter((unit) => selectedUnits.includes(String(unit.id)) || selectedUnits.includes(String(unit.title))).map((unit) => String(unit.title) + ": " + JSON.stringify(unit.lessons || []).slice(0, 2500)).join("\n");
      const prompt = "Create a complete English examination for Yemeni basic education. Return JSON only with keys title,titleAr,sections. Each section: sectionTitle,instructions,questionType,marks,questions. Each question: questionText,instructions,options,matchingPairs,passage,scrambledWords,modelAnswer,explanation,marks. Grade " + grade + ". Term " + String(input.term || "First Term") + ". Category " + String(input.category || "Monthly") + ". Units: " + selectedUnits.join(", ") + ". Total questions " + totalQuestions + ". Total marks " + totalMarks + ". Difficulty " + String(input.difficulty || "Medium") + ". Types " + JSON.stringify(input.selectedQuestionTypes || []) + ". Language " + String(input.instructionsLanguage || "Bilingual") + ". Scope " + String(input.contentScope || "CURRICULUM_ENRICHMENT") + ". Lessons " + JSON.stringify(input.selectedLessons || []) + ". Additional instructions " + String(input.customInstructions || "").slice(0, 1200) + ". Curriculum reference: " + context + ". Distribute marks so section marks sum exactly to " + totalMarks + ". Ensure question count is exactly " + totalQuestions + ". Do not include Quranic content.";
      try {
        const raw = await generateGemini(model, prompt, Number(settings.temperature) || 0.3);
        const generated = JSON.parse(raw);
        if (!Array.isArray(generated.sections) || !generated.sections.length) throw new Error("Generated exam sections are missing");
        let qIndex = 0;
        const sections = generated.sections.map((section, index) => {
          const questions = Array.isArray(section.questions) ? section.questions : [];
          return {
            id: "section-" + crypto.randomUUID(),
            sectionTitle: String(section.sectionTitle || "Section " + (index + 1)),
            instructions: String(section.instructions || "Answer all questions."),
            questionType: String(section.questionType || "Short Answer"),
            marks: Number(section.marks) || 0,
            questions: questions.map((q) => ({
              ...q,
              id: "q-ai-" + crypto.randomUUID(),
              ownerId: check.userId,
              grade,
              unitId: "ai-generated",
              type: String(q.type || section.questionType || "Short Answer"),
              difficulty: String(input.difficulty || "Medium"),
              marks: Number(q.marks) || 1,
              questionText: String(q.questionText || ""),
              modelAnswer: String(q.modelAnswer || ""),
              source: "Gemini AI",
              sourceCode: "CURRICULUM",
              educationalLevel: String(input.educationalLevel || "INTERMEDIATE"),
              createdAt: (/* @__PURE__ */ new Date()).toISOString()
            }))
          };
        });
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const schoolRow = await env.DB.prepare("SELECT record_json FROM school_settings WHERE singleton_id=1").first();
        const school = schoolRow ? JSON.parse(schoolRow.record_json) : {};
        const exam = {
          id: "exam-" + crypto.randomUUID(),
          ownerId: check.userId,
          subjectId: "subj-en",
          code: "AI-" + Date.now(),
          title: String(generated.title || "AI Generated Examination"),
          titleAr: String(generated.titleAr || "\u0627\u062E\u062A\u0628\u0627\u0631 \u0645\u0648\u0644\u0651\u062F \u0628\u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064A"),
          grade,
          term: String(input.term || "\u0627\u0644\u0641\u0635\u0644 \u0627\u0644\u062F\u0631\u0627\u0633\u064A \u0627\u0644\u0623\u0648\u0644"),
          category: String(input.category || "Monthly"),
          totalMarks,
          timeLimitMinutes: Number(input.timeLimitMinutes) || 60,
          difficulty: String(input.difficulty || "Medium"),
          contentScope: String(input.contentScope || "CURRICULUM_ENRICHMENT"),
          instructionsLanguage: String(input.instructionsLanguage || "Bilingual"),
          headerConfig: {
            countryTitle: String(school.countryTitleAr || "\u0627\u0644\u062C\u0645\u0647\u0648\u0631\u064A\u0629 \u0627\u0644\u064A\u0645\u0646\u064A\u0629"),
            ministryTitle: String(school.ministryTitleAr || "\u0648\u0632\u0627\u0631\u0629 \u0627\u0644\u062A\u0631\u0628\u064A\u0629 \u0648\u0627\u0644\u062A\u0639\u0644\u064A\u0645"),
            schoolName: String(school.schoolNameAr || "\u0645\u062F\u0631\u0633\u0629 \u0642\u0641\u0644\u0629 \u0644\u0644\u062A\u0639\u0644\u064A\u0645 \u0627\u0644\u0623\u0633\u0627\u0633\u064A"),
            subject: "\u0627\u0644\u0644\u063A\u0629 \u0627\u0644\u0625\u0646\u062C\u0644\u064A\u0632\u064A\u0629",
            subjectEn: "English Language",
            grade,
            term: String(input.term || "\u0627\u0644\u0641\u0635\u0644 \u0627\u0644\u062F\u0631\u0627\u0633\u064A \u0627\u0644\u0623\u0648\u0644"),
            academicYear: String(school.defaultAcademicYear || "2026 / 2027"),
            timeLimit: String(Number(input.timeLimitMinutes) || 60) + " minutes",
            totalMarks,
            showSchoolLogo: true,
            headerLanguage: "ar",
            headerCompact: false,
            notes: ""
          },
          sections,
          sharingEnabled: false,
          sharedWith: [],
          status: "Draft",
          createdBy: check.userId,
          createdByName: String(check.auth.user.name || ""),
          createdAt: now,
          updatedAt: now
        };
        const saved = await env.DB.prepare("INSERT INTO exams (id,owner_id,subject_id,grade,status,record_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").bind(exam.id, check.userId, "subj-en", grade, "Draft", JSON.stringify(exam), now, now).run();
        if (!saved.success) throw new Error("Could not save generated exam");
        const qualityReport = {
          passed: sections.reduce((sum, s) => sum + s.marks, 0) === totalMarks && sections.reduce((sum, s) => sum + s.questions.length, 0) === totalQuestions,
          score: 100,
          checks: [{ id: "generated", title: "Generated exam structure", passed: true, details: "AI output was parsed and saved" }],
          warnings: [],
          suggestions: ["Review all generated questions and answers before approval."]
        };
        await writeAILog(check.userId, "GENERATE_EXAM", model, "SUCCESS", "Generate exam for " + grade, Date.now() - started);
        return json({ success: true, exam, modelUsed: model, qualityReport });
      } catch (e) {
        await writeAILog(check.userId, "GENERATE_EXAM", model, "ERROR", "Generate exam for " + grade, Date.now() - started, String(e));
        return json({ error: "AI exam generation failed" }, 502);
      }
    }
    if (url.pathname === "/api/worker/questions/generate" && request.method === "POST") {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      const check = await aiAccess(request);
      if (!check.auth.ok) return json({ error: check.auth.error }, check.auth.status);
      if (!check.allowed) return json({ error: "AI_ACCESS_REQUIRED" }, 403);
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid question request" }, 400);
      const input = body;
      const grade = typeof input.grade === "string" ? input.grade : "Grade 9";
      const type = typeof input.type === "string" ? input.type : "Multiple Choice";
      const subjectId = typeof input.subjectId === "string" ? input.subjectId : "subj-en";
      if (subjectId === "subj-quran" || type.startsWith("Quran")) return json({ error: "AI generation is disabled for Quranic text" }, 400);
      const unitTitle = typeof input.unitTitle === "string" ? input.unitTitle : "Unit 1: General";
      const model = String((await readAISettings()).primaryModel || aiModels[0].id);
      const started = Date.now();
      const prompt = "You are an expert Yemeni basic education English examiner. Generate one clear exam question as JSON only. Grade: " + grade + ". Unit: " + unitTitle + ". Type: " + type + ". Difficulty: " + String(input.difficulty || "Medium") + ". Marks: " + String(input.marks || 2) + ". Focus: " + String(input.lessonFocus || "").slice(0, 500) + ". Return keys questionText, instructions, options (only for multiple choice), matchingPairs (only for matching), passage, scrambledWords, modelAnswer, explanation. Use exactly one unambiguous answer.";
      try {
        const raw = await generateGemini(model, prompt, Number((await readAISettings()).temperature) || 0.3);
        const parsed = JSON.parse(raw);
        if (typeof parsed.questionText !== "string" || typeof parsed.modelAnswer !== "string") throw new Error("Gemini response schema is invalid");
        const question = {
          ...parsed,
          id: "q-gen-" + crypto.randomUUID(),
          grade,
          unitId: "gen-unit",
          unitTitle,
          type,
          difficulty: String(input.difficulty || "Medium"),
          marks: Number(input.marks) || 2,
          sourceCode: String(input.sourceCode || "CURRICULUM"),
          educationalLevel: String(input.educationalLevel || "BASIC"),
          grammarCategory: typeof input.grammarCategory === "string" ? input.grammarCategory : void 0,
          source: "Gemini AI",
          ownerId: check.userId,
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        await writeAILog(check.userId, "GENERATE_QUESTION", model, "SUCCESS", "Generate " + type + " for " + grade, Date.now() - started);
        return json({ success: true, question, modelUsed: model });
      } catch (e) {
        await writeAILog(check.userId, "GENERATE_QUESTION", model, "ERROR", "Generate " + type + " for " + grade, Date.now() - started, String(e));
        return json({ error: "Question generation failed" }, 502);
      }
    }
    if (url.pathname === "/api/worker/layout-templates" && request.method === "GET") {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, new D1AuthVersionReader(env.DB), new D1UserRepository(env.DB));
      if (!auth.ok) return json({ error: auth.error }, auth.status);
      const r = await env.DB.prepare("SELECT record_json FROM layout_templates WHERE owner_id=? ORDER BY created_at DESC").bind(String(auth.user.id)).all();
      return r.success ? json((r.results || []).flatMap((row) => {
        try {
          return [JSON.parse(row.record_json)];
        } catch {
          return [];
        }
      })) : json({ error: "Layout templates unavailable" }, 503);
    }
    if (url.pathname === "/api/worker/layout-templates" && request.method === "POST") {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, new D1AuthVersionReader(env.DB), new D1UserRepository(env.DB));
      if (!auth.ok) return json({ error: auth.error }, auth.status);
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid layout template" }, 400);
      const input = body;
      if (typeof input.name !== "string" || !input.name.trim() || typeof input.nameAr !== "string" || !input.nameAr.trim() || !input.layoutConfig || typeof input.layoutConfig !== "object") return json({ error: "Template name and layout configuration are required" }, 400);
      const id = typeof input.id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(input.id) ? input.id : "layout-" + crypto.randomUUID();
      const template = { ...input, id, ownerId: String(auth.user.id), createdAt: (/* @__PURE__ */ new Date()).toISOString() };
      const saved = await env.DB.prepare("INSERT INTO layout_templates (id,owner_id,record_json,created_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET record_json=excluded.record_json").bind(id, String(auth.user.id), JSON.stringify(template), String(template.createdAt)).run();
      return saved.success ? json({ success: true, template }) : json({ error: "LAYOUT_TEMPLATE_SAVE_FAILED" }, 503);
    }
    const layoutIdMatch = url.pathname.match(/^\/api\/worker\/layout-templates\/([A-Za-z0-9_-]{1,128})$/);
    if (layoutIdMatch && request.method === "DELETE") {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, new D1AuthVersionReader(env.DB), new D1UserRepository(env.DB));
      if (!auth.ok) return json({ error: auth.error }, auth.status);
      const removed = await env.DB.prepare("DELETE FROM layout_templates WHERE id=? AND owner_id=?").bind(layoutIdMatch[1], String(auth.user.id)).run();
      return removed.success ? json({ success: true }) : json({ error: "LAYOUT_TEMPLATE_DELETE_FAILED" }, 503);
    }
    if (url.pathname === "/api/worker/documents" && request.method === "GET") {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      const check = await aiAccess(request);
      if (!check.auth.ok) return json({ error: check.auth.error }, check.auth.status);
      if (!check.allowed) return json({ error: "AI_ACCESS_REQUIRED" }, 403);
      const r = await env.DB.prepare("SELECT record_json FROM analyzed_documents WHERE owner_id=? ORDER BY created_at DESC").bind(check.userId).all();
      return r.success ? json((r.results || []).flatMap((row) => {
        try {
          return [JSON.parse(row.record_json)];
        } catch {
          return [];
        }
      })) : json({ error: "Documents unavailable" }, 503);
    }
    if (url.pathname === "/api/worker/documents" && request.method === "POST") {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      const check = await aiAccess(request);
      if (!check.auth.ok) return json({ error: check.auth.error }, check.auth.status);
      if (!check.allowed) return json({ error: "AI_ACCESS_REQUIRED" }, 403);
      const length = Number(request.headers.get("Content-Length") || 0);
      if (length > 1e7) return json({ error: "Document is too large" }, 413);
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid document" }, 400);
      const input = body;
      if (typeof input.title !== "string" || !input.title.trim()) return json({ error: "Document title is required" }, 400);
      const id = typeof input.id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(input.id) ? input.id : "doc-" + crypto.randomUUID();
      const document = { ...input, id, ownerId: check.userId, createdAt: (/* @__PURE__ */ new Date()).toISOString() };
      const saved = await env.DB.prepare("INSERT INTO analyzed_documents (id,owner_id,record_json,created_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET record_json=excluded.record_json").bind(id, check.userId, JSON.stringify(document), String(document.createdAt)).run();
      return saved.success ? json({ success: true, document }) : json({ error: "DOCUMENT_SAVE_FAILED" }, 503);
    }
    const documentIdMatch = url.pathname.match(/^\/api\/worker\/documents\/([A-Za-z0-9_-]{1,128})$/);
    if (documentIdMatch && ["GET", "DELETE"].includes(request.method)) {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      const check = await aiAccess(request);
      if (!check.auth.ok) return json({ error: check.auth.error }, check.auth.status);
      if (!check.allowed) return json({ error: "AI_ACCESS_REQUIRED" }, 403);
      if (request.method === "GET") {
        const row = await env.DB.prepare("SELECT record_json FROM analyzed_documents WHERE id=? AND owner_id=? LIMIT 1").bind(documentIdMatch[1], check.userId).first();
        return row ? json(JSON.parse(row.record_json)) : json({ error: "DOCUMENT_NOT_FOUND" }, 404);
      }
      const removed = await env.DB.prepare("DELETE FROM analyzed_documents WHERE id=? AND owner_id=?").bind(documentIdMatch[1], check.userId).run();
      return removed.success ? json({ success: true }) : json({ error: "DOCUMENT_DELETE_FAILED" }, 503);
    }
    const backupTables = ["app_users", "registration_requests", "notifications", "subjects", "school_settings", "curricula", "questions", "exams", "archived_exams", "layout_templates", "analyzed_documents", "ai_settings", "ai_usage_logs", "audit_logs", "question_images", "auth_rate_limits", "app_migrations"];
    const isPlatformOwner = /* @__PURE__ */ __name(async (request2) => {
      const auth = await authenticateWorkerRequest(request2, env.SESSION_SECRET, new D1AuthVersionReader(env.DB), new D1UserRepository(env.DB));
      if (!auth.ok) return { auth, ownerId: "", isOwner: false };
      return { auth, ownerId: String(auth.user.id), isOwner: String(auth.user.role) === "PlatformOwner" };
    }, "isPlatformOwner");
    const makeBackup = /* @__PURE__ */ __name(async (ownerId) => {
      if (!env.QUESTION_IMAGES) throw new Error("Private R2 bucket binding is missing");
      const tables = {};
      for (const table of backupTables) {
        const result = await env.DB.prepare("SELECT * FROM " + table).all();
        if (!result.success) throw new Error("Could not read table " + table);
        tables[table] = result.results || [];
      }
      const createdAt = (/* @__PURE__ */ new Date()).toISOString(), id = "backup-" + crypto.randomUUID();
      const snapshot = { format: "ABU_HUSSAM_D1_BACKUP_V1", createdAt, tables };
      const plain = new TextEncoder().encode(JSON.stringify(snapshot));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(env.SESSION_SECRET));
      const key = await crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
      const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
      const ivHex = Array.from(iv, (x) => x.toString(16).padStart(2, "0")).join("");
      const filename = "abu-hussam-backup-" + createdAt.replace(/[:.]/g, "-") + "-" + id.slice(-8) + ".json.enc";
      const objectKey = "backups/" + id + ".bin";
      await env.QUESTION_IMAGES.put(objectKey, encrypted, { httpMetadata: { contentType: "application/octet-stream" }, customMetadata: { backupId: id, createdBy: ownerId } });
      const record = { id, filename, objectKey, byteSize: encrypted.byteLength, ivHex, createdBy: ownerId, createdAt };
      const saved = await env.DB.prepare("INSERT INTO backup_metadata (id,filename,object_key,byte_size,iv_hex,created_by,created_at,record_json) VALUES (?,?,?,?,?,?,?,?)").bind(id, filename, objectKey, encrypted.byteLength, ivHex, ownerId, createdAt, JSON.stringify(record)).run();
      if (!saved.success) {
        await env.QUESTION_IMAGES.delete(objectKey).catch(() => void 0);
        throw new Error("Backup metadata could not be stored");
      }
      return record;
    }, "makeBackup");
    const readBackup = /* @__PURE__ */ __name(async (record) => {
      if (!env.QUESTION_IMAGES) throw new Error("Private R2 bucket binding is missing");
      const object = await env.QUESTION_IMAGES.get(String(record.object_key));
      if (!object) throw new Error("Backup object is missing from R2");
      const encrypted = await object.arrayBuffer();
      const ivText = String(record.iv_hex || "");
      if (!/^[a-f0-9]{24}$/.test(ivText)) throw new Error("Backup encryption metadata is invalid");
      const iv = new Uint8Array(ivText.match(/.{2}/g).map((x) => parseInt(x, 16)));
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(env.SESSION_SECRET));
      const key = await crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["decrypt"]);
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted);
      const parsed = JSON.parse(new TextDecoder().decode(plain));
      if (!parsed || typeof parsed !== "object" || parsed.format !== "ABU_HUSSAM_D1_BACKUP_V1") throw new Error("Backup format is invalid");
      return plain;
    }, "readBackup");
    if (url.pathname === "/api/worker/system/storage-status" && request.method === "GET") {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      const check = await isPlatformOwner(request);
      if (!check.auth.ok) return json({ error: check.auth.error }, check.auth.status);
      if (!check.isOwner) return json({ error: "FORBIDDEN" }, 403);
      try {
        const [users, questions, exams, images, backups] = await Promise.all([
          env.DB.prepare("SELECT COUNT(*) AS total FROM app_users").first(),
          env.DB.prepare("SELECT COUNT(*) AS total FROM questions").first(),
          env.DB.prepare("SELECT COUNT(*) AS total FROM exams").first(),
          env.DB.prepare("SELECT COUNT(*) AS total FROM question_images").first(),
          env.DB.prepare("SELECT COUNT(*) AS total FROM backup_metadata").first()
        ]);
        return json({
          database: "D1",
          r2Configured: Boolean(env.QUESTION_IMAGES),
          users: Number(users?.total || 0),
          questions: Number(questions?.total || 0),
          exams: Number(exams?.total || 0),
          questionImages: Number(images?.total || 0),
          backups: Number(backups?.total || 0)
        });
      } catch (e) {
        console.error("Worker storage status failed", e);
        return json({ error: "Storage status unavailable" }, 500);
      }
    }
    const restoreSnapshot = /* @__PURE__ */ __name(async (snapshot) => {
      if (!snapshot || typeof snapshot !== "object" || snapshot.format !== "ABU_HUSSAM_D1_BACKUP_V1") throw new Error("Backup format is invalid");
      const tables = snapshot.tables;
      if (!tables || typeof tables !== "object" || Array.isArray(tables)) throw new Error("Backup tables are invalid");
      if (!env.DB.batch) throw new Error("Transactional D1 batch is unavailable");
      const columns = {
        app_users: ["id", "username", "role", "status", "record_json", "created_at", "updated_at"],
        registration_requests: ["id", "username", "status", "record_json", "created_at", "updated_at"],
        notifications: ["id", "user_id", "record_json", "created_at"],
        subjects: ["id", "is_active", "sort_order", "record_json"],
        school_settings: ["singleton_id", "record_json", "updated_at"],
        curricula: ["id", "grade", "subject_id", "record_json"],
        questions: ["id", "owner_id", "subject_id", "grade", "unit_id", "record_json", "created_at", "updated_at"],
        exams: ["id", "owner_id", "subject_id", "grade", "status", "record_json", "created_at", "updated_at"],
        archived_exams: ["id", "owner_id", "subject_id", "grade", "status", "record_json", "archived_at"],
        layout_templates: ["id", "owner_id", "record_json", "created_at"],
        analyzed_documents: ["id", "owner_id", "record_json", "created_at"],
        ai_settings: ["singleton_id", "record_json", "updated_at"],
        ai_usage_logs: ["id", "user_id", "created_at", "record_json"],
        audit_logs: ["id", "user_id", "timestamp", "prev_hash", "entry_hash", "record_json"],
        question_images: ["id", "owner_id", "question_id", "object_key", "content_type", "byte_size", "checksum_sha256", "record_json", "created_at"],
        auth_rate_limits: ["bucket_key", "window_started_at", "attempts", "locked_until"],
        app_migrations: ["version", "applied_at", "checksum"]
      };
      const source = tables;
      const statements = [];
      for (const table of backupTables) {
        const rows = source[table];
        if (!Array.isArray(rows)) throw new Error("Backup is missing table " + table);
        const names = columns[table];
        statements.push(env.DB.prepare("DELETE FROM " + table));
        for (const item of rows) {
          if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Malformed row in " + table);
          const row = item;
          if (names.some((name) => !(name in row))) throw new Error("Incomplete row in " + table);
          statements.push(env.DB.prepare("INSERT INTO " + table + " (" + names.join(",") + ") VALUES (" + names.map(() => "?").join(",") + ")").bind(...names.map((name) => row[name] === void 0 ? null : row[name])));
        }
      }
      const results = await env.DB.batch(statements);
      if (results.some((result) => !result.success)) throw new Error("One or more D1 restore statements failed");
    }, "restoreSnapshot");
    if (url.pathname === "/api/worker/system/restore" && request.method === "POST") {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      const check = await isPlatformOwner(request);
      if (!check.auth.ok) return json({ error: check.auth.error }, check.auth.status);
      if (!check.isOwner) return json({ error: "FORBIDDEN" }, 403);
      try {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object" || typeof body.filename !== "string") return json({ error: "Backup filename is required" }, 400);
        const filename = String(body.filename);
        const row = await env.DB.prepare("SELECT * FROM backup_metadata WHERE filename=? LIMIT 1").bind(filename).first();
        if (!row) return json({ error: "BACKUP_NOT_FOUND" }, 404);
        const plain = await readBackup(row);
        const snapshot = JSON.parse(new TextDecoder().decode(plain));
        await makeBackup(check.ownerId);
        await restoreSnapshot(snapshot);
        return json({ success: true });
      } catch (e) {
        console.error("Worker backup restore failed", e);
        return json({ error: "Backup restore failed; a pre-restore backup was attempted" }, 503);
      }
    }
    if (url.pathname === "/api/worker/system/restore-upload" && request.method === "POST") {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      const check = await isPlatformOwner(request);
      if (!check.auth.ok) return json({ error: check.auth.error }, check.auth.status);
      if (!check.isOwner) return json({ error: "FORBIDDEN" }, 403);
      try {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object" || typeof body.content !== "string") return json({ error: "Backup JSON content is required" }, 400);
        const content = String(body.content);
        if (content.length > 3e7) return json({ error: "Backup file is too large" }, 413);
        const snapshot = JSON.parse(content);
        await makeBackup(check.ownerId);
        await restoreSnapshot(snapshot);
        return json({ success: true });
      } catch (e) {
        console.error("Worker uploaded backup restore failed", e);
        return json({ error: "Uploaded backup could not be restored; a pre-restore backup was attempted" }, 400);
      }
    }
    if (url.pathname === "/api/worker/system/backup" && request.method === "POST") {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      const check = await isPlatformOwner(request);
      if (!check.auth.ok) return json({ error: check.auth.error }, check.auth.status);
      if (!check.isOwner) return json({ error: "FORBIDDEN" }, 403);
      try {
        const backup = await makeBackup(check.ownerId);
        return json({ success: true, filename: backup.filename });
      } catch (e) {
        console.error("Worker backup creation failed", e);
        return json({ error: "Backup creation failed" }, 503);
      }
    }
    if (url.pathname === "/api/worker/system/backups" && request.method === "GET") {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      const check = await isPlatformOwner(request);
      if (!check.auth.ok) return json({ error: check.auth.error }, check.auth.status);
      if (!check.isOwner) return json({ error: "FORBIDDEN" }, 403);
      const r = await env.DB.prepare("SELECT filename FROM backup_metadata ORDER BY created_at DESC").all();
      return r.success ? json((r.results || []).map((x) => x.filename)) : json({ error: "Backup list unavailable" }, 503);
    }
    const backupDownloadMatch = url.pathname.match(/^\/api\/worker\/system\/backups\/([A-Za-z0-9._-]{1,180})\/download$/);
    const currentBackupDownload = url.pathname === "/api/worker/system/backup/download" && request.method === "GET";
    if ((backupDownloadMatch || currentBackupDownload) && request.method === "GET") {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      const check = await isPlatformOwner(request);
      if (!check.auth.ok) return json({ error: check.auth.error }, check.auth.status);
      if (!check.isOwner) return json({ error: "FORBIDDEN" }, 403);
      try {
        const row = currentBackupDownload ? await env.DB.prepare("SELECT * FROM backup_metadata ORDER BY created_at DESC LIMIT 1").first() : await env.DB.prepare("SELECT * FROM backup_metadata WHERE filename=? LIMIT 1").bind(decodeURIComponent(backupDownloadMatch[1])).first();
        if (!row) return json({ error: "BACKUP_NOT_FOUND" }, 404);
        const plain = await readBackup(row);
        const safeName = String(row.filename).replace(/[^A-Za-z0-9._-]/g, "_").replace(/\.enc$/, "");
        return new Response(plain, { status: 200, headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": 'attachment; filename="' + safeName + '"',
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff"
        } });
      } catch (e) {
        console.error("Worker backup download failed", e);
        return json({ error: "Backup download failed" }, 500);
      }
    }
    const sha256Hex2 = /* @__PURE__ */ __name(async (value) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map((x) => x.toString(16).padStart(2, "0")).join(""), "sha256Hex");
    const auditHash = /* @__PURE__ */ __name((prevHash, entry) => [
      prevHash,
      String(entry.id || ""),
      String(entry.timestamp || ""),
      String(entry.userId || ""),
      String(entry.action || ""),
      String(entry.category || "ADMIN"),
      String(entry.severity || "INFO"),
      String(entry.details || ""),
      String(entry.result || "SUCCESS")
    ].join("|"), "auditHash");
    const verifyAudit = /* @__PURE__ */ __name(async (logs) => {
      const broken = [];
      let chained = 0, legacy = 0;
      for (const entry of logs) {
        if (typeof entry.entryHash !== "string" || !entry.entryHash) {
          legacy++;
          continue;
        }
        chained++;
        const expected = await sha256Hex2(auditHash(String(entry.prevHash || "GENESIS"), entry));
        if (expected !== entry.entryHash) broken.push(String(entry.id || "unknown"));
      }
      return { valid: broken.length === 0, chainedCount: chained, legacyCount: legacy, brokenEntryIds: broken };
    }, "verifyAudit");
    const examExportLogMatch = url.pathname.match(/^\/api\/worker\/exams\/([A-Za-z0-9_-]{1,128})\/export-log$/);
    if (examExportLogMatch && request.method === "POST") {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, new D1AuthVersionReader(env.DB), new D1UserRepository(env.DB));
      if (!auth.ok) return json({ error: auth.error }, auth.status);
      const examId2 = examExportLogMatch[1];
      const row = await env.DB.prepare("SELECT record_json FROM exams WHERE id=? LIMIT 1").bind(examId2).first();
      if (!row) return json({ error: "EXAM_NOT_FOUND" }, 404);
      const exam = JSON.parse(row.record_json), actor = auth.user;
      const shares = Array.isArray(exam.sharedWith) ? exam.sharedWith : [];
      const permitted = exam.ownerId === actor.id || exam.createdBy === actor.id || shares.some((s) => s.userId === actor.id);
      if (!permitted) return json({ error: "FORBIDDEN_EXAM_EXPORT" }, 403);
      const previous = await env.DB.prepare("SELECT entry_hash FROM audit_logs ORDER BY timestamp DESC LIMIT 1").first();
      const prevHash = previous?.entry_hash || "GENESIS", timestamp = (/* @__PURE__ */ new Date()).toISOString(), id = "audit-" + crypto.randomUUID();
      const entry = {
        id,
        timestamp,
        userId: String(actor.id),
        actorName: String(actor.name || actor.username || actor.id),
        actorRole: String(actor.role || "Unknown"),
        action: "EXPORT_EXAM_PDF",
        category: "EXAM",
        severity: "INFO",
        details: "Exported exam PDF: " + String(exam.code || exam.title || examId2),
        result: "SUCCESS",
        examId: examId2,
        prevHash
      };
      const entryHash = await sha256Hex2(auditHash(prevHash, entry));
      const complete = { ...entry, entryHash };
      const saved = await env.DB.prepare("INSERT INTO audit_logs (id,user_id,timestamp,prev_hash,entry_hash,record_json) VALUES (?,?,?,?,?,?)").bind(id, String(actor.id), timestamp, prevHash, entryHash, JSON.stringify(complete)).run();
      return saved.success ? json({ success: true }) : json({ error: "EXPORT_LOG_FAILED" }, 503);
    }
    const ownerUserAction = url.pathname.match(/^\/api\/worker\/owner\/users\/([A-Za-z0-9_-]{1,128})\/(suspend|reactivate)$/);
    if (ownerUserAction && request.method === "POST") {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, new D1AuthVersionReader(env.DB), new D1UserRepository(env.DB));
      if (!auth.ok) return json({ error: auth.error }, auth.status);
      if (String(auth.user.role) !== "PlatformOwner") return json({ error: "FORBIDDEN" }, 403);
      const targetId = ownerUserAction[1], action = ownerUserAction[2];
      if (targetId === String(auth.user.id)) return json({ error: "CANNOT_CHANGE_OWN_ACCOUNT_STATUS" }, 400);
      const targetRow = await env.DB.prepare("SELECT record_json FROM app_users WHERE id=? LIMIT 1").bind(targetId).first();
      if (!targetRow) return json({ error: "USER_NOT_FOUND" }, 404);
      const target = JSON.parse(targetRow.record_json);
      if (String(target.role) === "PlatformOwner") return json({ error: "PLATFORM_OWNER_PROTECTED" }, 403);
      const status = action === "suspend" ? "SUSPENDED" : "ACTIVE", at = (/* @__PURE__ */ new Date()).toISOString();
      const updated = {
        ...target,
        status,
        authVersion: Number(target.authVersion || 0) + 1,
        ...action === "suspend" ? { suspendedAt: at } : { reactivatedAt: at }
      };
      const saved = await env.DB.prepare("UPDATE app_users SET status=?,record_json=?,updated_at=? WHERE id=?").bind(status, JSON.stringify(updated), at, targetId).run();
      if (!saved.success) return json({ error: "USER_STATUS_UPDATE_FAILED" }, 503);
      const { passwordHash: _hash2, authVersion: _version, ...safe } = updated;
      return json({ success: true, user: safe });
    }
    if (url.pathname === "/api/worker/owner/control-center" && request.method === "GET") {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, new D1AuthVersionReader(env.DB), new D1UserRepository(env.DB));
      if (!auth.ok) return json({ error: auth.error }, auth.status);
      if (String(auth.user.role) !== "PlatformOwner") return json({ error: "FORBIDDEN" }, 403);
      try {
        const [users, requests, exams, archive, notifications, logs] = await Promise.all([
          env.DB.prepare("SELECT record_json FROM app_users ORDER BY created_at DESC").all(),
          env.DB.prepare("SELECT record_json FROM registration_requests WHERE status IN ('PENDING_APPROVAL','NEEDS_EDIT') ORDER BY created_at DESC").all(),
          env.DB.prepare("SELECT record_json FROM exams ORDER BY created_at DESC LIMIT 1000").all(),
          env.DB.prepare("SELECT record_json FROM archived_exams ORDER BY archived_at DESC LIMIT 1000").all(),
          env.DB.prepare("SELECT record_json FROM notifications ORDER BY created_at DESC LIMIT 500").all(),
          env.DB.prepare("SELECT record_json FROM audit_logs ORDER BY timestamp DESC LIMIT 150").all()
        ]);
        const parse = /* @__PURE__ */ __name((rows) => rows.flatMap((row) => {
          try {
            return [JSON.parse(row.record_json)];
          } catch {
            return [];
          }
        }), "parse");
        const allUsers = parse(users.results || []), pending = parse(requests.results || []), allExams = parse(exams.results || []), allArchive = parse(archive.results || []), allNotifications = parse(notifications.results || []), audit = parse(logs.results || []);
        const unread = allNotifications.filter((n) => !(Array.isArray(n.readBy) ? n.readBy.map(String) : []).includes(String(auth.user.id)));
        const security = audit.filter((l) => l.category === "SECURITY" || ["HIGH", "CRITICAL"].includes(String(l.severity)));
        return json({
          summary: {
            pendingRegistrations: pending.length,
            unreadNotifications: unread.length,
            totalUsers: allUsers.length,
            activeUsers: allUsers.filter((u) => (u.status || "ACTIVE") === "ACTIVE").length,
            suspendedUsers: allUsers.filter((u) => u.status === "SUSPENDED").length,
            teachersCount: allUsers.filter((u) => u.role === "Teacher").length,
            schoolAdminsCount: allUsers.filter((u) => u.role === "SchoolAdmin").length,
            totalExams: allExams.length,
            archivedExams: allArchive.length,
            securityAlertsCount: security.length,
            criticalAlertsCount: audit.filter((l) => l.severity === "CRITICAL").length
          },
          pendingRequestsList: pending,
          usersOverview: allUsers.map((u) => {
            const { passwordHash: _hash2, authVersion: _version, ...safe } = u;
            return { ...safe, examsCount: allExams.filter((e) => (e.ownerId || e.createdBy) === u.id).length };
          }),
          recentSecurityAlerts: security.slice(0, 25),
          recentExamsActivity: allExams.slice(0, 15).map((e) => ({ id: e.id, title: e.title, titleAr: e.titleAr, code: e.code, status: e.status, grade: e.grade, createdAt: e.createdAt, createdByName: e.createdByName })),
          auditIntegrity: await verifyAudit(audit),
          storageStatus: { database: "D1", r2Configured: Boolean(env.QUESTION_IMAGES) }
        });
      } catch (e) {
        console.error("Owner control center failed", e);
        return json({ error: "Control center unavailable" }, 500);
      }
    }
    if (url.pathname === "/api/worker/owner/audit-logs" && request.method === "GET") {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, new D1AuthVersionReader(env.DB), new D1UserRepository(env.DB));
      if (!auth.ok) return json({ error: auth.error }, auth.status);
      if (String(auth.user.role) !== "PlatformOwner") return json({ error: "FORBIDDEN" }, 403);
      const category = url.searchParams.get("category") || "", severity = url.searchParams.get("severity") || "", userId = url.searchParams.get("userId") || "";
      const search = (url.searchParams.get("search") || "").toLowerCase(), limit = Math.min(1e3, Math.max(1, Number(url.searchParams.get("limit")) || 200));
      const r = await env.DB.prepare("SELECT record_json FROM audit_logs ORDER BY timestamp DESC LIMIT 2000").all();
      if (!r.success) return json({ error: "Audit log unavailable" }, 503);
      const logs = (r.results || []).flatMap((row) => {
        try {
          return [JSON.parse(row.record_json)];
        } catch {
          return [];
        }
      }).filter((log) => (!category || log.category === category) && (!severity || log.severity === severity) && (!userId || log.userId === userId) && (!search || JSON.stringify(log).toLowerCase().includes(search))).slice(0, limit);
      return json({ logs, integrity: await verifyAudit(logs) });
    }
    if (url.pathname === "/api/worker/owner/audit-logs/export" && request.method === "GET") {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, new D1AuthVersionReader(env.DB), new D1UserRepository(env.DB));
      if (!auth.ok) return json({ error: auth.error }, auth.status);
      if (String(auth.user.role) !== "PlatformOwner") return json({ error: "FORBIDDEN" }, 403);
      const r = await env.DB.prepare("SELECT record_json FROM audit_logs ORDER BY timestamp DESC LIMIT 5000").all();
      if (!r.success) return json({ error: "Audit log unavailable" }, 503);
      const logs = (r.results || []).flatMap((row) => {
        try {
          return [JSON.parse(row.record_json)];
        } catch {
          return [];
        }
      });
      if (url.searchParams.get("format") === "csv") {
        const keys = ["id", "timestamp", "userId", "actorName", "actorRole", "category", "severity", "action", "result", "ipAddress", "details"];
        const quote = /* @__PURE__ */ __name((v) => '"' + String(v ?? "").replace(/"/g, '""') + '"', "quote");
        const csv = [keys.join(","), ...logs.map((log) => keys.map((key) => quote(log[key])).join(","))].join("\n");
        return new Response("\uFEFF" + csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="qaflah-audit-log.csv"', "Cache-Control": "private, no-store" } });
      }
      return new Response(JSON.stringify({ exportedAt: (/* @__PURE__ */ new Date()).toISOString(), logs }, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": 'attachment; filename="qaflah-audit-log.json"', "Cache-Control": "private, no-store" } });
    }
    if (url.pathname === "/api/worker/auth/recover-owner" && request.method === "POST") {
      if (serviceUnavailable(env) || typeof env.OWNER_RECOVERY_TOKEN !== "string" || env.OWNER_RECOVERY_TOKEN.length < 32) {
        return json({ error: "Owner recovery is not configured" }, 503);
      }
      try {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid recovery request" }, 400);
        const input = body;
        const supplied = typeof input.recoveryToken === "string" ? input.recoveryToken : "";
        const password = typeof input.newPassword === "string" ? input.newPassword : "";
        if (password.length < 12 || password.length > 128) return json({ error: "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u064A\u062C\u0628 \u0623\u0646 \u062A\u0643\u0648\u0646 \u0628\u064A\u0646 12 \u0648128 \u062D\u0631\u0641\u0627\u064B" }, 400);
        const expectedBytes = new TextEncoder().encode(env.OWNER_RECOVERY_TOKEN);
        const suppliedBytes = new TextEncoder().encode(supplied);
        const expectedHash = new Uint8Array(await crypto.subtle.digest("SHA-256", expectedBytes));
        const suppliedHash = new Uint8Array(await crypto.subtle.digest("SHA-256", suppliedBytes));
        let mismatch = expectedHash.length ^ suppliedHash.length;
        for (let i = 0; i < expectedHash.length; i++) mismatch |= expectedHash[i] ^ (suppliedHash[i] || 0);
        if (mismatch !== 0) return json({ error: "\u0631\u0645\u0632 \u0627\u0644\u0627\u0633\u062A\u0639\u0627\u062F\u0629 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D" }, 403);
        const ownerRows = await env.DB.prepare("SELECT id FROM app_users WHERE username='abuhussam' COLLATE NOCASE AND role='PlatformOwner' LIMIT 2").all();
        if (!ownerRows.success || !ownerRows.results || ownerRows.results.length !== 1) return json({ error: "OWNER_ACCOUNT_NOT_UNIQUE" }, 409);
        const ownerId = ownerRows.results[0].id;
        const hash2 = await bcryptjs_default.hash(password, 12);
        const now = Date.now();
        const results = await env.DB.batch([
          env.DB.prepare("UPDATE app_users SET record_json=json_set(record_json,'$.passwordHash',?,'$.authVersion',COALESCE(json_extract(record_json,'$.authVersion'),0)+1,'$.failedLoginAttempts',0,'$.lockedUntil',NULL),updated_at=? WHERE id=? AND NOT EXISTS (SELECT 1 FROM auth_rate_limits WHERE bucket_key='owner-recovery-used')").bind(hash2, (/* @__PURE__ */ new Date()).toISOString(), ownerId),
          env.DB.prepare("INSERT OR IGNORE INTO auth_rate_limits (bucket_key,window_started_at,attempts,locked_until) VALUES ('owner-recovery-used',?,1,?)").bind(now, now)
        ]);
        if (Number(results[0]?.meta?.changes || 0) !== 1) return json({ error: "OWNER_RECOVERY_ALREADY_USED" }, 409);
        return json({ success: true, message: "\u062A\u0645 \u062A\u062D\u062F\u064A\u062B \u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u0627\u0644\u0645\u0627\u0644\u0643. \u064A\u0645\u0643\u0646\u0643 \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0627\u0644\u0622\u0646." });
      } catch (error) {
        console.error("Owner recovery failed", error);
        return json({ error: "OWNER_RECOVERY_FAILED" }, 500);
      }
    }
    if (url.pathname === "/api/worker/auth/reset-password" && request.method === "POST") {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, new D1AuthVersionReader(env.DB), new D1UserRepository(env.DB));
      if (!auth.ok) return json({ error: auth.error }, auth.status);
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid password reset request" }, 400);
      const input = body, targetId = typeof input.userId === "string" ? input.userId : "", password = typeof input.newPassword === "string" ? input.newPassword : "";
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(targetId) || password.length < 8 || password.length > 128) return json({ error: "Password must be 8 to 128 characters" }, 400);
      const actor = auth.user;
      const target = await new D1UserRepository(env.DB).findPublicById(targetId);
      if (!target) return json({ error: "USER_NOT_FOUND" }, 404);
      const self = String(actor.id) === targetId, owner = String(actor.role) === "PlatformOwner";
      const schoolAdmin = String(actor.role) === "SchoolAdmin" && String(target.role) === "Teacher";
      if (!self && !owner && !schoolAdmin) return json({ error: "FORBIDDEN" }, 403);
      const hash2 = await bcryptjs_default.hash(password, 10);
      const updated = await new D1UserRepository(env.DB).setPasswordHash(targetId, hash2);
      return updated ? json({ success: true, message: "Password updated" }) : json({ error: "PASSWORD_UPDATE_FAILED" }, 404);
    }
    if (url.pathname === "/api/worker/auth/switch-user" && request.method === "POST") {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, new D1AuthVersionReader(env.DB), new D1UserRepository(env.DB));
      if (!auth.ok) return json({ error: auth.error }, auth.status);
      if (String(auth.user.role) !== "PlatformOwner") return json({ error: "FORBIDDEN" }, 403);
      const body = await request.json().catch(() => null);
      const targetId = body && typeof body === "object" && typeof body.userId === "string" ? String(body.userId) : "";
      const target = await new D1UserRepository(env.DB).findPublicById(targetId);
      if (!target || target.status !== "ACTIVE") return json({ error: "USER_NOT_FOUND_OR_INACTIVE" }, 404);
      const token = await signWorkerAuthToken({ id: String(target.id), role: String(target.role) }, env.SESSION_SECRET, new D1AuthVersionReader(env.DB));
      return json({ success: true, token, user: target });
    }
    if (url.pathname === "/api/worker/system/audit-logs" && request.method === "GET") {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      try {
        const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, new D1AuthVersionReader(env.DB), new D1UserRepository(env.DB));
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        if (String(auth.user.role) !== "PlatformOwner") return json({ error: "FORBIDDEN" }, 403);
        const r = await env.DB.prepare("SELECT record_json FROM audit_logs ORDER BY timestamp DESC LIMIT 1000").all();
        if (!r.success) return json({ error: "Audit log unavailable" }, 503);
        return json((r.results || []).flatMap((row) => {
          try {
            return [JSON.parse(row.record_json)];
          } catch {
            return [];
          }
        }));
      } catch (e) {
        console.error("Worker audit log read failed", e);
        return json({ error: "Audit log unavailable" }, 500);
      }
    }
    if (url.pathname === "/api/worker/system/stats" && request.method === "GET") {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      try {
        const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, new D1AuthVersionReader(env.DB), new D1UserRepository(env.DB));
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const userId = String(auth.user.id);
        const [exams, archive, questions, curricula, subjects, recent] = await Promise.all([
          env.DB.prepare("SELECT record_json FROM exams WHERE owner_id=?").bind(userId).all(),
          env.DB.prepare("SELECT record_json FROM archived_exams WHERE owner_id=?").bind(userId).all(),
          env.DB.prepare("SELECT record_json FROM questions WHERE owner_id=?").bind(userId).all(),
          env.DB.prepare("SELECT record_json FROM curricula").all(),
          env.DB.prepare("SELECT COUNT(*) AS total FROM subjects WHERE is_active=1").first(),
          env.DB.prepare("SELECT record_json FROM exams WHERE owner_id=? ORDER BY created_at DESC LIMIT 5").bind(userId).all()
        ]);
        if (![exams, archive, questions, curricula].every((x) => x.success)) return json({ error: "Dashboard statistics unavailable" }, 503);
        const parse = /* @__PURE__ */ __name((rows) => rows.flatMap((row) => {
          try {
            return [JSON.parse(row.record_json)];
          } catch {
            return [];
          }
        }), "parse");
        const examList = parse(exams.results || []), archiveList = parse(archive.results || []), questionList = parse(questions.results || []), curriculumList = parse(curricula.results || []);
        const grades = Array.from({ length: 9 }, (_, i) => "Grade " + (i + 1));
        const gradeStats = Object.fromEntries(grades.map((grade) => [grade, {
          examsCount: examList.filter((x) => x.grade === grade).length,
          questionsCount: questionList.filter((x) => x.grade === grade).length,
          unitsCount: curriculumList.filter((x) => x.grade === grade).length
        }]));
        return json({
          totalExams: examList.length,
          savedExams: examList.filter((x) => x.status === "Approved").length,
          draftExams: examList.filter((x) => ["Draft", "Validated"].includes(String(x.status))).length,
          archivedExams: archiveList.length,
          totalQuestions: questionList.length,
          activeSubjectsCount: Number(subjects?.total || 0),
          gradeStats,
          recentExams: parse(recent.results || []),
          hasAIAccess: auth.user.hasAIAccess === true
        });
      } catch (e) {
        console.error("Worker dashboard stats failed", e);
        return json({ error: "Dashboard statistics unavailable" }, 500);
      }
    }
    if (url.pathname === "/api/worker/bootstrap/status" && request.method === "GET") {
      if (!env.DB) return json({ error: "Database unavailable" }, 503);
      try {
        const row = await env.DB.prepare("SELECT COUNT(*) AS total FROM app_users").first();
        return json({ needsSetup: Number(row?.total || 0) === 0 });
      } catch (e) {
        console.error("Bootstrap status check failed", e);
        return json({ error: "Bootstrap status unavailable" }, 500);
      }
    }
    if (url.pathname === "/api/worker/bootstrap" && request.method === "POST") {
      if (serviceUnavailable(env) || !env.BOOTSTRAP_TOKEN || env.BOOTSTRAP_TOKEN.length < 32) return json({ error: "Bootstrap is not configured" }, 503);
      try {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid bootstrap request" }, 400);
        const input = body;
        const supplied = typeof input.token === "string" ? input.token : "";
        const expectedBytes = new TextEncoder().encode(env.BOOTSTRAP_TOKEN);
        const suppliedBytes = new TextEncoder().encode(supplied);
        const expectedHash = new Uint8Array(await crypto.subtle.digest("SHA-256", expectedBytes));
        const suppliedHash = new Uint8Array(await crypto.subtle.digest("SHA-256", suppliedBytes));
        let mismatch = expectedHash.length ^ suppliedHash.length;
        for (let i = 0; i < expectedHash.length; i++) mismatch |= expectedHash[i] ^ (suppliedHash[i] || 0);
        if (mismatch !== 0) return json({ error: "Invalid bootstrap token" }, 403);
        const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM app_users").first();
        if (Number(count?.total || 0) !== 0) return json({ error: "BOOTSTRAP_ALREADY_COMPLETED" }, 409);
        const fullName = typeof input.fullName === "string" ? input.fullName.trim() : "";
        const username = typeof input.username === "string" ? input.username.trim() : "";
        const password = typeof input.password === "string" ? input.password : "";
        if (fullName.length < 3 || fullName.length > 120 || !/^[A-Za-z0-9._-]{3,32}$/.test(username) || password.length < 12 || password.length > 128) {
          return json({ error: "Name, username, or password does not meet the requirements" }, 400);
        }
        const now = (/* @__PURE__ */ new Date()).toISOString(), id = "usr-" + crypto.randomUUID();
        const user = {
          id,
          username,
          name: fullName,
          role: "PlatformOwner",
          status: "ACTIVE",
          hasAIAccess: true,
          assignedSubjects: ["all"],
          assignedGrades: ["all"],
          delegatedPermissions: { canManageTeachers: true, canManageSubjects: true, canManageIdentity: true, canManageCurricula: true },
          createdAt: now,
          passwordHash: await bcryptjs_default.hash(password, 12),
          authVersion: 0
        };
        const created = await env.DB.prepare("INSERT INTO app_users (id,username,role,status,record_json,created_at,updated_at) SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM app_users)=0").bind(id, username, "PlatformOwner", "ACTIVE", JSON.stringify(user), now, now).run();
        if (!created.success || Number(created.meta?.changes || 0) !== 1) return json({ error: "BOOTSTRAP_RACE_OR_FAILURE" }, 409);
        const { passwordHash: _hash2, authVersion: _version, ...safe } = user;
        return json({ success: true, user: safe }, 201);
      } catch (e) {
        console.error("Platform owner bootstrap failed", e);
        return json({ error: "Bootstrap failed" }, 500);
      }
    }
    if (url.pathname === "/api/worker/health" && request.method === "GET") {
      return json({ status: "ok", runtime: "cloudflare-workers", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
    }
    if (url.pathname === "/api/worker/archive" && request.method === "GET") {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      try {
        const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, new D1AuthVersionReader(env.DB), new D1UserRepository(env.DB));
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const r = await env.DB.prepare("SELECT record_json FROM archived_exams WHERE owner_id = ? ORDER BY archived_at DESC").bind(auth.user.id).all();
        if (!r.success) return json({ error: "Archive unavailable" }, 503);
        const items = (r.results || []).flatMap((row) => {
          try {
            const v = JSON.parse(row.record_json);
            return v && typeof v === "object" ? [v] : [];
          } catch {
            return [];
          }
        });
        return json(items);
      } catch (e) {
        console.error("Worker archive read failed", e);
        return json({ error: "Archive unavailable" }, 500);
      }
    }
    const restorePrefix = "/api/worker/archive/";
    const restoreTail = url.pathname.startsWith(restorePrefix) ? url.pathname.slice(restorePrefix.length) : "";
    const restoreId = restoreTail.endsWith("/restore") ? restoreTail.slice(0, -8) : "";
    if (restoreId && /^[A-Za-z0-9_-]{1,128}$/.test(restoreId) && request.method === "POST") {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      try {
        const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, new D1AuthVersionReader(env.DB), new D1UserRepository(env.DB));
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const row = await env.DB.prepare("SELECT record_json FROM archived_exams WHERE id=? AND owner_id=? LIMIT 1").bind(restoreId, auth.user.id).first();
        if (!row) return json({ error: "ARCHIVED_EXAM_NOT_FOUND" }, 404);
        const exam = JSON.parse(row.record_json);
        const restored = { ...exam, status: "Draft", archivedAt: null, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
        const ins = await env.DB.prepare("INSERT INTO exams (id,owner_id,subject_id,grade,status,record_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET owner_id=excluded.owner_id,subject_id=excluded.subject_id,grade=excluded.grade,status=excluded.status,record_json=excluded.record_json,updated_at=excluded.updated_at").bind(restoreId, auth.user.id, String(restored.subjectId || "subj-en"), String(restored.grade || ""), "Draft", JSON.stringify(restored), String(restored.createdAt || (/* @__PURE__ */ new Date()).toISOString()), String(restored.updatedAt)).run();
        if (!ins.success) return json({ error: "EXAM_RESTORE_FAILED" }, 503);
        const del = await env.DB.prepare("DELETE FROM archived_exams WHERE id=? AND owner_id=?").bind(restoreId, auth.user.id).run();
        return del.success ? json({ success: true }) : json({ error: "EXAM_RESTORE_PENDING_CLEANUP" }, 503);
      } catch (e) {
        console.error("Worker exam restore failed", e);
        return json({ error: "EXAM_RESTORE_FAILED" }, 500);
      }
    }
    const sharePrefix = "/api/worker/exams/";
    const shareTail = url.pathname.startsWith(sharePrefix) ? url.pathname.slice(sharePrefix.length) : "";
    const shareParts = shareTail.split("/");
    const shareExamId = /^[A-Za-z0-9_-]{1,128}$/.test(shareParts[0] || "") ? shareParts[0] : "";
    if (shareExamId && shareParts[1] === "share" && (shareParts.length === 2 || shareParts.length === 3) && (shareParts.length === 2 && request.method === "POST" || shareParts.length === 3 && request.method === "DELETE")) {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      try {
        const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, new D1AuthVersionReader(env.DB), new D1UserRepository(env.DB));
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const actor = auth.user;
        const row = await env.DB.prepare("SELECT record_json FROM exams WHERE id=? AND owner_id=? LIMIT 1").bind(shareExamId, actor.id).first();
        if (!row) return json({ error: "EXAM_NOT_FOUND_OR_NOT_OWNER" }, 404);
        const exam = JSON.parse(row.record_json);
        let shares = Array.isArray(exam.sharedWith) ? [...exam.sharedWith] : [];
        if (request.method === "POST") {
          const body = await request.json().catch(() => null);
          if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid share request" }, 400);
          const input = body;
          const targetId = typeof input.targetUserId === "string" ? input.targetUserId : "";
          const permission = input.permission === "edit" ? "edit" : input.permission === "view" ? "view" : "";
          if (!/^[A-Za-z0-9_-]{1,128}$/.test(targetId) || !permission || targetId === actor.id) return json({ error: "Invalid share target or permission" }, 400);
          const target = await new D1UserRepository(env.DB).findPublicById(targetId);
          if (!target || target.status !== "ACTIVE") return json({ error: "SHARE_TARGET_UNAVAILABLE" }, 404);
          const grades = Array.isArray(target.assignedGrades) ? target.assignedGrades.map(String) : [];
          const subjects = Array.isArray(target.assignedSubjects) ? target.assignedSubjects.map(String) : [];
          const isAdmin = ["PlatformOwner", "Administrator", "SchoolAdmin"].includes(String(target.role));
          if (!isAdmin && (!(grades.includes("all") || grades.includes(String(exam.grade || ""))) || !(subjects.includes("all") || subjects.includes(String(exam.subjectId || "subj-en"))))) return json({ error: "SHARE_TARGET_OUT_OF_SCOPE" }, 403);
          shares = shares.filter((x) => x.userId !== targetId);
          shares.push({ userId: targetId, permission, sharedAt: (/* @__PURE__ */ new Date()).toISOString(), sharedBy: actor.id });
        } else {
          const targetId = shareParts[2];
          if (!/^[A-Za-z0-9_-]{1,128}$/.test(targetId)) return json({ error: "Invalid share target" }, 400);
          shares = shares.filter((x) => x.userId !== targetId);
        }
        const updated = { ...exam, sharedWith: shares, sharingEnabled: shares.length > 0, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
        const saved = await env.DB.prepare("UPDATE exams SET record_json=?,updated_at=? WHERE id=? AND owner_id=?").bind(JSON.stringify(updated), String(updated.updatedAt), shareExamId, actor.id).run();
        if (!saved.success || Number(saved.meta?.changes || 0) !== 1) return json({ error: "EXAM_SHARE_UPDATE_FAILED" }, 503);
        return json({ success: true, exam: updated });
      } catch (e) {
        console.error("Worker exam sharing failed", e);
        return json({ error: "EXAM_SHARE_FAILED" }, 500);
      }
    }
    const examPrefix = "/api/worker/exams/";
    const examTail = url.pathname.startsWith(examPrefix) ? url.pathname.slice(examPrefix.length) : "";
    const examParts = examTail.split("/");
    const examId = /^[A-Za-z0-9_-]{1,128}$/.test(examParts[0] || "") ? examParts[0] : "";
    const examAction = examParts.length === 2 ? examParts[1] : "";
    const examCollection = url.pathname === "/api/worker/exams";
    if (examCollection && ["GET", "POST"].includes(request.method) || examId && (examParts.length === 1 && ["GET", "PUT", "DELETE"].includes(request.method) || examParts.length === 2 && request.method === "POST" && ["clone", "approve"].includes(examAction))) {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      try {
        const users = new D1UserRepository(env.DB);
        const versions = new D1AuthVersionReader(env.DB);
        const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, versions, users);
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const actor = auth.user;
        const role = String(actor.role || "");
        const grades = Array.isArray(actor.assignedGrades) ? actor.assignedGrades.map(String) : [];
        const subjects = Array.isArray(actor.assignedSubjects) ? actor.assignedSubjects.map(String) : [];
        const admin = ["PlatformOwner", "Administrator", "SchoolAdmin"].includes(role);
        const inScope = /* @__PURE__ */ __name((e) => admin || (grades.includes("all") || grades.includes(String(e.grade || ""))) && (subjects.includes("all") || subjects.includes(String(e.subjectId || "subj-en"))), "inScope");
        const allowed = /* @__PURE__ */ __name((e, need) => {
          if (e.ownerId === actor.id || e.createdBy === actor.id) return true;
          const shares = Array.isArray(e.sharedWith) ? e.sharedWith : [];
          return shares.some((x) => !!x && typeof x === "object" && x.userId === actor.id && (x.permission === "edit" || need === "view" && x.permission === "view"));
        }, "allowed");
        const parse = /* @__PURE__ */ __name((s) => {
          try {
            const v = JSON.parse(s);
            return v && typeof v === "object" && !Array.isArray(v) ? v : null;
          } catch {
            return null;
          }
        }, "parse");
        const read = /* @__PURE__ */ __name(async (id) => {
          const r = await env.DB.prepare("SELECT record_json FROM exams WHERE id = ? LIMIT 1").bind(id).first();
          return r ? parse(r.record_json) : null;
        }, "read");
        const save = /* @__PURE__ */ __name(async (e) => {
          const createdAt = typeof e.createdAt === "string" ? e.createdAt : (/* @__PURE__ */ new Date()).toISOString();
          const updatedAt = (/* @__PURE__ */ new Date()).toISOString();
          const v = { ...e, createdAt, updatedAt };
          const r = await env.DB.prepare(
            "INSERT INTO exams (id, owner_id, subject_id, grade, status, record_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET owner_id=excluded.owner_id, subject_id=excluded.subject_id, grade=excluded.grade, status=excluded.status, record_json=excluded.record_json, updated_at=excluded.updated_at"
          ).bind(
            String(v.id),
            String(v.ownerId || v.createdBy || actor.id),
            String(v.subjectId || "subj-en"),
            String(v.grade || ""),
            String(v.status || "Draft"),
            JSON.stringify(v),
            createdAt,
            updatedAt
          ).run();
          if (!r.success) throw new Error("D1 exam save failed");
          return v;
        }, "save");
        if (examCollection && request.method === "GET") {
          const r = await env.DB.prepare("SELECT record_json FROM exams ORDER BY created_at DESC").all();
          if (!r.success) return json({ error: "Exam workspace unavailable" }, 503);
          return json((r.results || []).flatMap((row) => {
            const e = parse(row.record_json);
            return e && inScope(e) && allowed(e, "view") ? [e] : [];
          }));
        }
        if (examCollection && request.method === "POST") {
          if (Number(request.headers.get("Content-Length") || 0) > 1e7) return json({ error: "Exam payload is too large" }, 413);
          const body = await request.json().catch(() => null);
          if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid exam payload" }, 400);
          const input = body;
          if (!hasValidExamImagePayload(input)) return json({ error: "Invalid or oversized exam image payload" }, 400);
          if (typeof input.title !== "string" || !input.title.trim() || typeof input.grade !== "string" || !input.grade.trim() || !Array.isArray(input.sections)) return json({ error: "Incomplete exam data" }, 400);
          if (!inScope(input)) return json({ error: "FORBIDDEN_ACADEMIC_SCOPE" }, 403);
          if (typeof input.id === "string" && input.id.trim()) {
            const old = await read(input.id);
            if (old) {
              if (!allowed(old, "edit")) return json({ error: "FORBIDDEN_EXAM_EDIT" }, 403);
              const { ownerId: _o, createdBy: _c, createdByName: _n, sharedWith: _s, id: _i, ...patch } = input;
              return json({ success: true, exam: await save({ ...old, ...patch, id: input.id, ownerId: old.ownerId || old.createdBy || actor.id }) });
            }
          }
          const now = (/* @__PURE__ */ new Date()).toISOString();
          return json({ success: true, exam: await save({
            ...input,
            id: typeof input.id === "string" ? input.id : "exam-" + crypto.randomUUID(),
            ownerId: actor.id,
            createdBy: actor.id,
            createdByName: actor.name,
            sharingEnabled: false,
            sharedWith: [],
            createdAt: now
          }) });
        }
        const existing = await read(examId);
        if (!existing) return json({ error: "EXAM_NOT_FOUND" }, 404);
        if (!inScope(existing)) return json({ error: "FORBIDDEN_ACADEMIC_SCOPE" }, 403);
        if (request.method === "GET") return allowed(existing, "view") ? json(existing) : json({ error: "FORBIDDEN_EXAM_VIEW" }, 403);
        if (request.method === "DELETE") {
          if ((existing.ownerId || existing.createdBy) !== actor.id) return json({ error: "FORBIDDEN_EXAM_ARCHIVE" }, 403);
          const at = (/* @__PURE__ */ new Date()).toISOString(), archived = { ...existing, status: "Archived", archivedAt: at, updatedAt: at };
          const ins = await env.DB.prepare("INSERT INTO archived_exams (id, owner_id, subject_id, grade, status, record_json, archived_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET record_json=excluded.record_json,status=excluded.status,archived_at=excluded.archived_at").bind(examId, String(existing.ownerId || existing.createdBy || actor.id), String(existing.subjectId || "subj-en"), String(existing.grade || ""), "Archived", JSON.stringify(archived), at).run();
          if (!ins.success) return json({ error: "EXAM_ARCHIVE_FAILED" }, 503);
          const del = await env.DB.prepare("DELETE FROM exams WHERE id=? AND owner_id=?").bind(examId, String(existing.ownerId || existing.createdBy || actor.id)).run();
          return del.success ? json({ success: true }) : json({ error: "EXAM_ARCHIVE_FAILED" }, 503);
        }
        if (request.method === "PUT") {
          if (!allowed(existing, "edit")) return json({ error: "FORBIDDEN_EXAM_EDIT" }, 403);
          if (Number(request.headers.get("Content-Length") || 0) > 1e7) return json({ error: "Exam payload is too large" }, 413);
          const body = await request.json().catch(() => null);
          if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid exam update" }, 400);
          const patch = body;
          if (!hasValidExamImagePayload(patch)) return json({ error: "Invalid or oversized exam image payload" }, 400);
          const { ownerId: _o, createdBy: _c, createdByName: _n, sharedWith: _s, id: _i, ...safe } = patch;
          const next = { ...existing, ...safe, id: examId, ownerId: existing.ownerId || existing.createdBy || actor.id, createdBy: existing.createdBy || actor.id };
          if (!inScope(next)) return json({ error: "FORBIDDEN_ACADEMIC_SCOPE" }, 403);
          return json({ success: true, exam: await save(next) });
        }
        if (examAction === "approve" && request.method === "POST") {
          if (!allowed(existing, "edit")) return json({ error: "FORBIDDEN_EXAM_EDIT" }, 403);
          return json({ success: true, exam: await save({ ...existing, status: "Approved" }) });
        }
        if (examAction === "clone" && request.method === "POST") {
          if (!allowed(existing, "view")) return json({ error: "FORBIDDEN_EXAM_VIEW" }, 403);
          const now = (/* @__PURE__ */ new Date()).toISOString();
          const clone = await save({
            ...existing,
            id: "exam-" + crypto.randomUUID(),
            code: String(existing.code || "EXAM") + "-COPY",
            title: String(existing.title || "Exam") + " (Copy)",
            titleAr: String(existing.titleAr || existing.title || "\u0627\u062E\u062A\u0628\u0627\u0631") + " (\u0646\u0633\u062E\u0629 \u062C\u062F\u064A\u062F\u0629)",
            status: "Draft",
            ownerId: actor.id,
            createdBy: actor.id,
            createdByName: actor.name,
            sharingEnabled: false,
            sharedWith: [],
            createdAt: now
          });
          return json({ success: true, exam: clone });
        }
      } catch (error) {
        console.error("Worker exam request failed", error);
        return json({ error: "Exam operation failed" }, 500);
      }
    }
    const pdfRoute = url.pathname.match(/^\/api\/worker\/exams\/([A-Za-z0-9_-]{1,128})\/export-pdf$/);
    if (pdfRoute && request.method === "POST") {
      if (serviceUnavailable(env) || !env.BROWSER) return json({ error: "PDF rendering unavailable" }, 503);
      try {
        const users = new D1UserRepository(env.DB);
        const versions = new D1AuthVersionReader(env.DB);
        const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, versions, users);
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const contentLength = Number(request.headers.get("Content-Length") || 0);
        if (contentLength > 1e7) return json({ error: "PDF source is too large" }, 413);
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Invalid PDF request" }, 400);
        const input = body;
        if (typeof input.htmlDocument !== "string" || input.htmlDocument.length < 100 || input.htmlDocument.length > 95e5) {
          return json({ error: "Invalid PDF document" }, 400);
        }
        const mode = input.mode === "TeacherAnswerKey" ? "TeacherAnswerKey" : "StudentPaper";
        const html = input.htmlDocument.replace(/<\/?(?:script|iframe|object|embed|base|form)\b[^>]*>/gi, "").replace(/<link\b[^>]*>/gi, "").replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "").replace(/@import\s+[^;]+;?/gi, "").replace(/url\(\s*(['"]?)(?:https?:|javascript:|file:|data:text\/html)[^)]*\)/gi, "none").replace(/\s+(?:src|href)\s*=\s*(['"])https?:[^'"]*\1/gi, "");
        const rate = await env.DB.prepare(
          "INSERT INTO auth_rate_limits (bucket_key, window_started_at, attempts, locked_until) VALUES (?, ?, 1, NULL) ON CONFLICT(bucket_key) DO UPDATE SET attempts = CASE WHEN window_started_at + 60000 <= ? THEN 1 ELSE attempts + 1 END, window_started_at = CASE WHEN window_started_at + 60000 <= ? THEN ? ELSE window_started_at END RETURNING attempts"
        ).bind(`pdf:${auth.user.id}`, Date.now(), Date.now(), Date.now(), Date.now()).first();
        if (!rate || Number(rate.attempts) > 8) return json({ error: "PDF export rate limit exceeded" }, 429);
        const pdf = await env.BROWSER.quickAction("pdf", {
          html,
          pdfOptions: { printBackground: true, preferCSSPageSize: true },
          rejectRequestPattern: [".*"]
        });
        if (!pdf.ok) return json({ error: "PDF rendering failed" }, 502);
        const filename = typeof input.filename === "string" && /^[A-Za-z0-9._-]{1,100}\.pdf$/i.test(input.filename) ? input.filename : `exam-${mode === "TeacherAnswerKey" ? "answer-key" : "student"}.pdf`;
        return new Response(pdf.body, {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff"
          }
        });
      } catch (error) {
        console.error("Worker PDF export failed", error);
        return json({ error: "PDF export failed" }, 500);
      }
    }
    if (url.pathname.startsWith("/api/worker/question-images")) {
      if (serviceUnavailable(env) || !env.QUESTION_IMAGES) {
        return json({ error: "Image storage unavailable" }, 503);
      }
      try {
        const users = new D1UserRepository(env.DB);
        const versions = new D1AuthVersionReader(env.DB);
        const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, versions, users);
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const storage = new QuestionImageStorage(env.QUESTION_IMAGES, env.DB);
        const ownerId = typeof auth.user.id === "string" ? auth.user.id : "";
        if (!ownerId) return json({ error: "Invalid authenticated user" }, 401);
        if (url.pathname === "/api/worker/question-images" && request.method === "POST") {
          const length = Number(request.headers.get("Content-Length") || 0);
          if (length > 41e5) return json({ error: "Image payload is too large" }, 413);
          const body = await request.json().catch(() => null);
          if (!body || typeof body !== "object" || Array.isArray(body)) {
            return json({ error: "Invalid image payload" }, 400);
          }
          const input = body;
          const questionId = typeof input.questionId === "string" ? input.questionId : "";
          const dataUrl = typeof input.imageDataUrl === "string" ? input.imageDataUrl : "";
          const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
          if (!match || match[2].length > 3916020) return json({ error: "Unsupported or oversized image" }, 400);
          const binary = atob(match[2]);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const metadata = await storage.upload({
            ownerId,
            questionId,
            contentType: match[1],
            bytes
          });
          return json({ success: true, image: { id: metadata.id, questionId: metadata.questionId, contentType: metadata.contentType, byteSize: metadata.byteSize } }, 201);
        }
        const imageMatch = url.pathname.match(/^\/api\/worker\/question-images\/([A-Za-z0-9_-]{1,128})$/);
        if (imageMatch && request.method === "GET") {
          const image = await storage.getForOwner(imageMatch[1], ownerId);
          if (!image) return json({ error: "Image not found" }, 404);
          return new Response(image.bytes, {
            headers: {
              "Content-Type": image.contentType,
              "Content-Length": String(image.byteSize),
              "Cache-Control": "private, no-store",
              "X-Content-Type-Options": "nosniff"
            }
          });
        }
        if (imageMatch && request.method === "DELETE") {
          const deleted = await storage.deleteForOwner(imageMatch[1], ownerId);
          return deleted ? json({ success: true }) : json({ error: "Image not found" }, 404);
        }
        return json({ error: "Not found" }, 404);
      } catch (error) {
        console.error("Worker question image request failed", error);
        return json({ error: "Image request failed" }, 400);
      }
    }
    if (url.pathname.startsWith("/api/worker/auth/") || url.pathname.startsWith("/api/worker/owner/")) {
      if (serviceUnavailable(env)) return json({ error: "Service unavailable" }, 503);
      try {
        const authService = new WorkerAuthService(env.DB, env.SESSION_SECRET);
        if (url.pathname === "/api/worker/auth/register" && request.method === "POST") {
          const body = await request.json().catch(() => null);
          const result = await authService.register(
            body,
            clientIp(request),
            request.headers.get("User-Agent") || ""
          );
          return json(result.body, result.status);
        }
        if (url.pathname === "/api/worker/auth/login" && request.method === "POST") {
          const body = await request.json().catch(() => null);
          const result = await authService.login(body, clientIp(request));
          return json(result.body, result.status);
        }
        if (url.pathname === "/api/worker/auth/me" && request.method === "GET") {
          const users = new D1UserRepository(env.DB);
          const versions = new D1AuthVersionReader(env.DB);
          const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, versions, users);
          if (!auth.ok) return json({ error: auth.error }, auth.status);
          return json({ user: auth.user });
        }
        if (url.pathname.startsWith("/api/worker/owner/registration-requests")) {
          const users = new D1UserRepository(env.DB);
          const versions = new D1AuthVersionReader(env.DB);
          const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, versions, users);
          if (!auth.ok) return json({ error: auth.error }, auth.status);
          if (!["PlatformOwner", "Administrator"].includes(String(auth.user.role))) {
            return json({ error: "FORBIDDEN" }, 403);
          }
          if (url.pathname === "/api/worker/owner/registration-requests" && request.method === "GET") {
            const status = url.searchParams.get("status") || void 0;
            return json({ requests: await authService.listRegistrationRequests(status) });
          }
          const match = url.pathname.match(/^\/api\/worker\/owner\/registration-requests\/([^/]+)\/(approve|reject|needs-edit)$/);
          if (match && request.method === "POST") {
            const requestId = decodeURIComponent(match[1]);
            const body = await request.json().catch(() => ({}));
            const input = body && typeof body === "object" ? body : {};
            if (match[2] === "approve") {
              const outcome = await authService.approveRegistrationRequest(requestId, auth.user, {
                role: typeof input.role === "string" ? input.role : void 0,
                assignedSubjects: input.assignedSubjects,
                assignedGrades: input.assignedGrades,
                reviewNote: typeof input.reviewNote === "string" ? input.reviewNote : void 0
              });
              return outcome ? json({ success: true, ...outcome }) : json({ error: "REGISTRATION_NOT_FOUND" }, 404);
            }
            const reviewNote = typeof input.reviewNote === "string" ? input.reviewNote : typeof input.reason === "string" ? input.reason : "\u0644\u0645 \u062A\u0633\u062A\u0648\u0641\u0650 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0634\u0631\u0648\u0637 \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629";
            const status = match[2] === "reject" ? "REJECTED" : "NEEDS_EDIT";
            const updated = await authService.reviewRegistrationRequest(requestId, auth.user, status, reviewNote);
            return updated ? json({ success: true, request: updated }) : json({ error: "REGISTRATION_NOT_FOUND" }, 404);
          }
        }
      } catch (error) {
        console.error("Worker authentication request failed", error);
        return json({ error: "Internal server error" }, 500);
      }
    }
    return json({ error: "Not found" }, 404);
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
