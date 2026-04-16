package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/pem"
	"flag"
	"fmt"
	"io"
	"os"
)

// cmdKeygen generates an Ed25519 keypair used to sign bundles. The private
// key is PEM-encoded (unencrypted — devs wrap it in their secret manager);
// the public key ships next to the bundle so the marketplace can verify.
func cmdKeygen(args []string) error {
	fs := flag.NewFlagSet("keygen", flag.ExitOnError)
	out := fs.String("out", "dev", "output prefix (<prefix>.pem and <prefix>.pub)")
	_ = fs.Parse(args)

	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return fmt.Errorf("keygen: %w", err)
	}
	privBlock := &pem.Block{Type: "METACORE PRIVATE KEY", Bytes: priv}
	if err := os.WriteFile(*out+".pem", pem.EncodeToMemory(privBlock), 0o600); err != nil {
		return err
	}
	pubBlock := &pem.Block{Type: "METACORE PUBLIC KEY", Bytes: pub}
	if err := os.WriteFile(*out+".pub", pem.EncodeToMemory(pubBlock), 0o644); err != nil {
		return err
	}
	fmt.Printf("wrote %s.pem (private) and %s.pub (public)\n", *out, *out)
	return nil
}

// cmdSign signs a bundle tarball with the Ed25519 private key and writes
// <bundle>.sig (base64 of the signature). Verifiers load <key>.pub, compute
// SHA-256 over the bundle, and ed25519.Verify against the signature bytes.
func cmdSign(args []string) error {
	fs := flag.NewFlagSet("sign", flag.ExitOnError)
	keyFile := fs.String("key", "", "path to PEM-encoded Ed25519 private key (required)")
	_ = fs.Parse(args)
	if fs.NArg() < 1 {
		return fmt.Errorf("sign: missing bundle path")
	}
	if *keyFile == "" {
		return fmt.Errorf("sign: --key required")
	}
	priv, err := loadPrivateKey(*keyFile)
	if err != nil {
		return err
	}
	bundlePath := fs.Arg(0)
	digest, err := sha256File(bundlePath)
	if err != nil {
		return err
	}
	sig := ed25519.Sign(priv, digest)
	sigPath := bundlePath + ".sig"
	if err := os.WriteFile(sigPath, []byte(base64.StdEncoding.EncodeToString(sig)), 0o644); err != nil {
		return err
	}
	fmt.Printf("signed %s → %s\n", bundlePath, sigPath)
	return nil
}

func loadPrivateKey(path string) (ed25519.PrivateKey, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	block, _ := pem.Decode(data)
	if block == nil {
		return nil, fmt.Errorf("sign: %s is not PEM-encoded", path)
	}
	if len(block.Bytes) != ed25519.PrivateKeySize {
		return nil, fmt.Errorf("sign: key is not Ed25519 (got %d bytes, want %d)", len(block.Bytes), ed25519.PrivateKeySize)
	}
	return ed25519.PrivateKey(block.Bytes), nil
}

func sha256File(path string) ([]byte, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return nil, err
	}
	return h.Sum(nil), nil
}
