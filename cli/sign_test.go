package main

import (
	"crypto/ed25519"
	"encoding/base64"
	"encoding/pem"
	"os"
	"path/filepath"
	"testing"
)

func TestKeygenAndSignRoundtrip(t *testing.T) {
	dir := t.TempDir()
	prefix := filepath.Join(dir, "dev")
	if err := cmdKeygen([]string{"--out", prefix}); err != nil {
		t.Fatalf("keygen: %v", err)
	}
	bundle := filepath.Join(dir, "bundle.tar.gz")
	if err := os.WriteFile(bundle, []byte("fake bundle"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := cmdSign([]string{"--key", prefix + ".pem", bundle}); err != nil {
		t.Fatalf("sign: %v", err)
	}

	sigB64, err := os.ReadFile(bundle + ".sig")
	if err != nil {
		t.Fatalf("read sig: %v", err)
	}
	sig, err := base64.StdEncoding.DecodeString(string(sigB64))
	if err != nil {
		t.Fatalf("decode sig: %v", err)
	}
	pubData, _ := os.ReadFile(prefix + ".pub")
	block, _ := pem.Decode(pubData)
	if block == nil {
		t.Fatal("expected PEM block in pub file")
	}
	pub := ed25519.PublicKey(block.Bytes)
	digest, err := sha256File(bundle)
	if err != nil {
		t.Fatal(err)
	}
	if !ed25519.Verify(pub, digest, sig) {
		t.Fatalf("signature did not verify with generated pubkey")
	}
}
