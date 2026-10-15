import json
from unittest.mock import Mock
import pytest
import spotify_playlist
from app import create_app


def html(rows):
 entity={'type':'playlist','id':'37i9dQZF1DXcBWIGoYBM5M','name':'Prueba','trackList':rows}
 return '<script id="__NEXT_DATA__">'+json.dumps({'props':{'pageProps':{'state':{'data':{'entity':entity}}}}})+'</script>'


def test_public_playlist_and_cors(monkeypatch,tmp_path):
 rows=[{'uri':'spotify:track:12yb2l6pa0AQgMacytK57O','title':'Song','subtitle':'Artist'}]*51
 response=Mock(status_code=200,text=html(rows),content=html(rows).encode())
 get=Mock(return_value=response);monkeypatch.setattr(spotify_playlist.requests,'get',get)
 app=create_app(tmp_path)
 try:
  with app.test_client() as c:
   result=c.get('/api/spotify/playlist',query_string={'url':'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=ignored'},headers={'Origin':'https://jcarlos1215.github.io'})
   assert result.status_code==200
   assert len(result.json['tracks'])==50 and result.json['truncated']
   assert result.json['available']==51
   assert result.headers['Access-Control-Allow-Origin']=='https://jcarlos1215.github.io'
   assert get.call_args.args[0]=='https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M'
   assert 'Access-Control-Allow-Origin' not in c.get('/api/spotify/playlist',query_string={'url':'https://127.0.0.1/'},headers={'Origin':'https://evil.example'}).headers
 finally:app.extensions['jobs'].executor.shutdown(wait=True)


@pytest.mark.parametrize('url',['https://127.0.0.1/playlist/37i9dQZF1DXcBWIGoYBM5M','https://open.spotify.com.evil.example/playlist/37i9dQZF1DXcBWIGoYBM5M','https://open.spotify.com@evil.example/playlist/37i9dQZF1DXcBWIGoYBM5M','https://open.spotify.com/track/37i9dQZF1DXcBWIGoYBM5M','http://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M'])
def test_invalid_links_never_request_remote(url,monkeypatch):
 get=Mock();monkeypatch.setattr(spotify_playlist.requests,'get',get)
 with pytest.raises(ValueError):spotify_playlist.resolve_playlist(url)
 get.assert_not_called()
