import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { get, ref, set } from 'firebase/database';
import { database } from '../firebase';

const Lobby = () => {
  const [roomCode, setRoomCode] = useState('');
  const router = useRouter();

  const createRoom = async () => {
    const newRoomCode = Math.floor(1000 + Math.random() * 9000).toString();
    const roomRef = ref(database, `rooms/${newRoomCode}`);
    
    await set(roomRef, {
      players: { player1: { id: 'player1' } },
      isGameStarted: false,
    });

    router.push({
      pathname: '/game',
      params: { room: newRoomCode, player: 'player1' },
    });
  };

  const joinRoom = async () => {
    if (!roomCode || roomCode.length !== 4) {
      Alert.alert('Error', 'Please enter a valid 4-digit room code.');
      return;
    }
    
    const roomRef = ref(database, `rooms/${roomCode}`);
    const snapshot = await get(roomRef);

    if (snapshot.exists()) {
      const roomData = snapshot.val();
      if (Object.keys(roomData.players).length < 2) {
        const player2Ref = ref(database, `rooms/${roomCode}/players/player2`);
        await set(player2Ref, { id: 'player2' });
        router.push({
          pathname: '/game',
          params: { room: roomCode, player: 'player2' },
        });
      } else {
        Alert.alert('Error', 'This room is already full.');
      }
    } else {
      Alert.alert('Error', 'Room does not exist.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Cambio Multiplayer</Text>
      <TouchableOpacity style={styles.button} onPress={createRoom}>
        <Text style={styles.buttonText}>Create Room</Text>
      </TouchableOpacity>
      
      <Text style={styles.orText}>- OR -</Text>

      <TextInput
        style={styles.input}
        placeholder="Enter 4-Digit Code"
        placeholderTextColor="#999"
        value={roomCode}
        onChangeText={setRoomCode}
        maxLength={4}
        keyboardType="number-pad"
      />
      <TouchableOpacity style={styles.button} onPress={joinRoom}>
        <Text style={styles.buttonText}>Join Room</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f3a1d',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 40,
  },
  button: {
    backgroundColor: '#FFD700',
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 30,
    marginVertical: 10,
    width: '80%',
    alignItems: 'center',
  },
  buttonText: {
    color: 'black',
    fontSize: 20,
    fontWeight: 'bold',
  },
  orText: {
    color: '#FFD700',
    fontSize: 18,
    marginVertical: 15,
  },
  input: {
    backgroundColor: '#fff',
    width: '80%',
    padding: 15,
    borderRadius: 10,
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
  },
});

export default Lobby;