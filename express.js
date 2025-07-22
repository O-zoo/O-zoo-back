const express = require('express')
const session = require('express-session')
const qs = require('qs')
const axios = require('axios')
const app = express()
app.use(express.static(__dirname))
app.use(express.json())
require('dotenv').config()

const port = process.env.PORT || 3000
const host = '0.0.0.0'

app.use(
  session({
    secret: "FRFKRQR9IVahOAfY88oWjNdOUdT8TrvN",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  })
)

const cors = require('cors')
app.use(cors())

const { spawn } = require('child_process')

const User = require('./models/user')
const Bet = require('./models/bet')

const client_id = "5089e08676bae2c4b65964f001a0fb20"
const client_secret = "FRFKRQR9IVahOAfY88oWjNdOUdT8TrvN"
const domain = "https://o-zoo-back.onrender.com"
const redirect_uri = `${domain}/redirect`
const token_uri = "https://kauth.kakao.com/oauth/token"
const api_host = "https://kapi.kakao.com"

const mongoose = require('mongoose')
const url = process.env.MONGODB_URL

mongoose.connect(url)
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error(err))

async function call(method, uri, param, header) {
  let rtn;
  try {
    rtn = await axios({
      method: method,   
      url: uri,         
      headers: header,  // 요청 헤더 (예: Content-Type, Authorization 등)
      data: param,      // 전송할 요청 데이터 (body)
    });
  } catch (err) {
    rtn = err.response;
  }
  // 요청 성공 또는 실패에 상관없이 응답 데이터 반환
  return rtn.data;
}

function askGemini(question) {
  return new Promise((resolve, reject) => {
    const py = spawn('python', ['./gemini.py', question])

    let result = ''
    let error = ''

    py.stdout.on('data', (data) => {
      result += data.toString()
    })

    py.stderr.on('data', (data) => {
      error += data.toString()
    })

    py.on('close', (code) => {
      if (code === 0) {
        resolve(result)
      } else {
        reject(error || `Python process exited with code ${code}`)
      }
    })
  })
}

app.get("/authorize", function (req, res) {
  // 선택: 사용자에게 추가 동의를 요청하는 경우, scope 값으로 동의항목 ID를 전달
  // 친구 목록, 메시지 전송 등 접근권한 요청 가능
  // (예: /authorize?scope=friends,talk_message)
  let { scope } = req.query;
  let scopeParam = "";
  if (scope) {
    scopeParam = "&scope=" + scope;
  }

  // 카카오 인증 서버로 리다이렉트
  // 사용자 동의 후 리다이렉트 URI로 인가 코드가 전달
  res.status(302).redirect(
      `https://kauth.kakao.com/oauth/authorize?client_id=${client_id}&redirect_uri=${redirect_uri}&response_type=code${scopeParam}`
  );
});

app.get("/redirect", async function (req, res) {
  // 인가 코드 발급 요청에 필요한 파라미터 구성
  const param = qs.stringify({
    grant_type: "authorization_code",   // 인증 방식 고정값
    client_id: client_id,               // 내 앱의 REST API 키
    redirect_uri: redirect_uri,         // 등록된 리다이렉트 URI
    code: req.query.code,               // 전달받은 인가 코드
    client_secret: client_secret,       // 선택: 클라이언트 시크릿(Client Secret) 사용 시 추가
  })

  // API 요청 헤더 설정
  const header = { "content-type": "application/x-www-form-urlencoded" }

  // 카카오 인증 서버에 액세스 토큰 요청
  const rtn = await call("POST", token_uri, param, header)

  // 발급받은 액세스 토큰을 세션에 저장 (로그인 상태 유지 목적)
  req.session.key = rtn.access_token
  req.session.refreshKey = rtn.refresh_token
  console.log(`redirection access token : ${rtn.access_token}, refresh token : ${rtn.refresh_token}`)

  // 로그인 완료 후 메인 페이지로 이동
  res.status(302).redirect(`ozoo://main?login=success&token=${rtn.access_token}&refresh=${rtn.refresh_token}&expires_in=${rtn.expires_in}`)
})

app.get("/refresh", async function (req, res) {
  // 인가 코드 발급 요청에 필요한 파라미터 구성
  const refreshToken = req.body.refreshToken;
  const param = qs.stringify({
    grant_type: "refresh_token",   // 인증 방식 고정값
    client_id: client_id,               // 내 앱의 REST API 키
    refresh_token: refreshToken,         // refresh Token
    client_secret: client_secret,       // 선택: 클라이언트 시크릿(Client Secret) 사용 시 추가
  })

  // API 요청 헤더 설정
  const header = { "content-type": "application/x-www-form-urlencoded" }

  // 카카오 인증 서버에 액세스 토큰 요청
  const rtn = await call("POST", 'https://kauth.kakao.com/oauth/token', param, header)
  console.log(`refresh, ${rtn}`)

  // 로그인 완료 후 메인 페이지로 이동
  res.json(rtn)
})

app.get("/profile", async function (req, res) {
  const auth = req.headers.authorization
  const token = auth ? auth.split(' ')[1] : null
  if(!token){
    return res.status(401).json({ code : -401, msg: "access token missing" })
  }
  const uri = api_host + "/v2/user/me"  // 사용자 정보 가져오기 API 주소
  const param = {}  // 사용자 정보 요청 시 파라미터는 필요 없음
  const header = {
    "content-type": "application/x-www-form-urlencoded",  // 요청 헤더 Content-Type 지정
    Authorization: "Bearer " + token,  // 세션에 저장된 액세스 토큰 전달
  }

  const rtn = await call("POST", uri, param, header)  // 카카오 API에 요청 전송

  res.send(rtn)  // 조회한 사용자 정보를 클라이언트에 반환
})

app.get("/logout", async function (req, res) {
  const uri = api_host + "/v1/user/logout"  // 로그아웃 API 주소
  const header = {
    Authorization: "Bearer " + req.session.key  // 세션에 저장된 액세스 토큰 전달
  }

  const rtn = await call("POST", uri, null, header)  // 카카오 API에 로그아웃 요청 전송
  req.session.destroy()  // 세션 삭제 (로그아웃 처리)
  res.send(rtn)  // 응답 결과 클라이언트에 반환
})

// 연결 끊기 요청: 사용자와 앱의 연결을 해제하고 세션 종료
app.get("/unlink", async function (req, res) {
  const uri = api_host + "/v1/user/unlink"  // 연결 끊기 API 주소
  const header = {
    Authorization: "Bearer " + req.session.key  // 세션에 저장된 액세스 토큰 전달
  }

  const rtn = await call("POST", uri, null, header)  // 카카오 API에 연결 끊기 요청 전송
  req.session.destroy()  // 세션 삭제 (연결 해제 처리)
  res.send(rtn)  // 응답 결과 클라이언트에 반환
})

app.get('/', async (req, res) => {
  res.send('Server On')
})

app.get('/deleteUser', async (req, res) => {
  await User.deleteMany({})
  res.send('Deleted all users')
})

app.post("/api/user/register", async (req, res) => {
  try {
    const user = new User(req.body)
    await user.save()
    console.log(user)
    res.status(200).json({ success: true })
  } catch (err) {
    res.json({ success: false, err })
  }
})

app.post("/api/bet/register", async (req, res) => {
  try {
    const bet = new Bet(req.body)
    await bet.save()
    console.log(bet)
    res.status(200).json({ success: true })
  } catch (err) {
    res.json({ success: false, err })
  }
})

app.post("/api/user/findById", async (req, res) => {
  try {
    const { id } = req.body
    if (!id) {
      return res.status(400).json({
        loginSuccess: false,
        message: "아이디를 입력하세요.",
      })
    }

    const user = await User.findOne({ id });
    if (!user) {
      return res.status(401).json({
        loginSuccess: false,
        message: "아이디가 존재하지 않습니다.",
      })
    }
    res
      .status(200)
      .json({ loginSuccess: true, id: user.id, name: user.name, profile_img: user.profile_img, score: user.score, exp: user.exp, birth: user.birth, wins: user.wins, losses: user.losses })
  } catch (err) {
    res.status(500).json({
      loginSuccess: false,
      message: "서버 오류가 발생했습니다.",
      error: err.message,
    })
  }
})

app.post('/api/user/update', async (req, res) => {
  const id = req.body.id
  const exp = req.body.exp
  const score = req.body.score
  const wins = req.body.wins
  const losses = req.body.losses
  if (!id) {
    return res.status(400).json({ success: false, message: 'ID를 입력하세요.' })
  }
  if (exp === undefined || exp === null) {
    return res.status(400).json({ success: false, message: '경험치를 입력하세요.' })
  }
  if (score === undefined || score === null) {
    return res.status(400).json({ success: false, message: '점수를 입력하세요.' })
  }
  if (wins === undefined || wins === null) {
    return res.status(400).json({ success: false, message: '승리횟수를 입력하세요.' })
  }
  if (losses === undefined || losses === null) {
    return res.status(400).json({ success: false, message: '패배횟수를 입력하세요.' })
  }

  try {
    const user = await User.findOne({ id: id })
    if (!user) {
      return res.status(404).json({ success: false, message: '등록된 아이디가 없습니다.' })
    }

    user.exp = exp
    user.score = score
    user.wins = wins
    user.losses = losses
    await user.save()
    console.log(user)
    res.status(200).json({ success: true })
  } catch (err) {
    res.json({ success: false, err })
  }
})

app.get("/api/top10", async (req, res) => {
  try {
    const topPlayersRaw = await User.aggregate([
      { $sort: { score: -1 } },
      { $limit: 10 },
      {
        $project: {
          _id: 0,    
          name: 1,
          score: 1,
        }
      }
    ]);

    const topPlayers = topPlayersRaw.map((player, index) => ({
      ...player,
      rank: index+1,
    }));

    res.status(200).json({ topPlayers });
  } catch (err) {
    console.error('Error fetching top players:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
})

app.post("/api/user/friendRankings", async function (req, res) {
  const auth = req.headers.authorization
  const token = auth ? auth.split(' ')[1] : null
  if(!token){
    return res.status(401).json({ code : -401, msg: "access token missing" })
  }
  const uri = api_host + "/v1/api/talk/friends"  // 사용자 친구 가져오기 API 주소
  const param = {}  // 사용자 정보 요청 시 파라미터는 필요 없음
  const header = {
    "content-type": "application/x-www-form-urlencoded",  // 요청 헤더 Content-Type 지정
    Authorization: "Bearer " + token,  // 세션에 저장된 액세스 토큰 전달
  }

  const rtn = await call("GET", uri, param, header)  // 카카오 API에 요청 전송

  const friends = rtn.data.elements.map(friend => String(friend.id))

  if (friends.length === 0) {
    return res.status(200).json({success: true, message: '앱에 가입한 카카오톡 친구가 없습니다.', rankings: []})
  }

  const friendsIn = await User.find({id: {$in: friends}})

  const rankedUsers = friendsIn
    .sort((a, b) => b.score - a.score)
    .map((user, index) => ({
      rank: index + 1,
      name: user.name,
      score: user.score,
    }));
  
  return res.status(200).json({
    success: true,
    count: rankedUsers.length,
    rankings: rankedUsers
  })
})

app.post('/api/user/bet/ongoing', async (req, res) => {
  const id = req.body.id
  if (!id) {
    return res.status(400).json({ success: false, message: 'ID를 입력하세요.' })
  }

  const now = new Date()
  try {
    const bets = await Bet.find({
      'members.id': id,
      start: { $lte: now },
      end: { $gte: now },
    })
    console.log(bets)
    res.json(bets)
  } catch (err) {
    res.status(500).json({ error : `server error, ${err.message}`})
  }
})

app.post('/api/user/bet/ended', async (req, res) => {
  const id = req.body.id
  if (!id) {
    return res.status(400).json({ success: false, message: 'ID를 입력하세요.' })
  }

  const now = new Date()
  try {
    const bets = await Bet.find({
      'members.id': id,
      end: { $lte: now },
    })
    console.log(bets)
    res.json(bets)
  } catch (err) {
    res.status(500).json({ error : `server error, ${err.message}`})
  }
})

app.post('/api/user/getLuck', async (req, res) => {
    const birthday = req.body.birth
    var fullQuestion = "내 생일은 " + birthday + "이야. 내 오늘 내기는 잘 풀릴지 운세를 알려줘. 재물운도 함께 알려줘."
    try {
        const answer = await askGemini(fullQuestion);
        res.json({answer : answer})
    } catch (err) {
        res.json({error : err})
    }
})

app.listen(port, () => {
    console.log(`Server running on port ${port}`)
})
